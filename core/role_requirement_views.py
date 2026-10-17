"""
Role Requirements Assessment (HQ offices: Comd KA, DAC, COP, COT, Col Trg,
Col Pers, SOI HRM, SOI Trg, SOII Cp & Cses, SOII Trg).

Authorization model (decided by the system owner, Oct 2026):
- Only superadmins can use this API. A superadmin records a submission on
  behalf of an office (the "recorder", ``created_by``).
- Drafts are visible and editable only by their recorder.
- Review decisions (start review, request clarification, approve, reject,
  duplicate linking) must be taken by a *different* superadmin — nobody
  reviews a submission they recorded.
- Delivery tracking (in development, implemented, verified) may be recorded
  by any superadmin; verification records the stakeholder's confirmation.

Submissions are HQ-level records with no school, so tenant scoping does not
apply; access is restricted to the global superadmin role instead.
"""
import logging
import re
import uuid

from django.db import transaction
from django.db.models import Q
from django.http import Http404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from audit.constants import AuditAction
from audit.mixins import AuditedDestroyMixin

from .models import RoleRequirementSubmission, RoleRequirementAuditLog
from .permissions import IsSuperAdmin
from .role_requirement_serializers import (
    ACCESS_BOUNDARIES,
    CAPABILITY_TYPES,
    CONTENT_FIELDS,
    INFORMATION_FORMATS,
    ApproveSerializer,
    ClarificationSerializer,
    ImplementationSerializer,
    LinkDuplicateSerializer,
    NotesSerializer,
    RejectSerializer,
    RoleRequirementContentSerializer,
    RoleRequirementDetailSerializer,
    RoleRequirementListSerializer,
    VerifySerializer,
    completeness_errors,
)
from .views import PageSizeAwarePagination

logger = logging.getLogger(__name__)

Submission = RoleRequirementSubmission
Status = Submission.Status
Action = RoleRequirementAuditLog.Action

# Statuses whose content has been validated by a reviewer.
VALIDATED_STATUSES = (
    Status.APPROVED, Status.IN_DEVELOPMENT, Status.IMPLEMENTED, Status.VERIFIED,
)
DUPLICATE_LINKABLE_STATUSES = (
    Status.SUBMITTED, Status.UNDER_REVIEW, Status.CLARIFICATION_REQUIRED,
)
REVIEW_ACTIONS = {
    'start_review', 'request_clarification', 'approve', 'reject',
    'link_duplicate', 'unlink_duplicate', 'add_note',
}
DELIVERY_ACTIONS = {
    'mark_in_development': Status.IN_DEVELOPMENT,
    'mark_implemented': Status.IMPLEMENTED,
    'verify': Status.VERIFIED,
}


def allowed_actions_for(submission, user):
    """Actions the given superadmin may take now — used by the UI only.
    Every action is re-checked on the server when it is called."""
    is_recorder = submission.created_by_id == user.id
    current = submission.status
    actions = []
    if is_recorder and current in Submission.EDITABLE_STATUSES:
        actions += ['edit', 'submit']
        if current == Status.DRAFT and not submission.submitted_at:
            actions.append('delete')
    if not is_recorder:
        if current == Status.SUBMITTED:
            actions.append('start_review')
        if current == Status.UNDER_REVIEW:
            actions += ['request_clarification', 'approve', 'reject']
        if current in DUPLICATE_LINKABLE_STATUSES:
            actions.append('unlink_duplicate' if submission.duplicate_of_id else 'link_duplicate')
        if current != Status.DRAFT:
            actions.append('add_note')
    for name, target in DELIVERY_ACTIONS.items():
        if submission.can_transition_to(target):
            actions.append(name)
    return actions


def _content_snapshot(submission):
    snapshot = {}
    for field in CONTENT_FIELDS:
        if field == 'revises':
            snapshot[field] = str(submission.revises_id) if submission.revises_id else None
        else:
            snapshot[field] = getattr(submission, field)
    return snapshot


def _log(submission, action_name, user, *, from_status='', to_status='', notes='', changes=None):
    RoleRequirementAuditLog.objects.create(
        submission=submission,
        action=action_name,
        from_status=from_status,
        to_status=to_status,
        performed_by=user,
        notes=notes,
        changes=changes or {},
    )


class PasswordChangeCompleted(BasePermission):
    # The shared ForcePasswordChangePermission reads ``view.__name__``, which a
    # ViewSet instance does not have (it raises AttributeError -> HTTP 500), so
    # this view enforces the same rule directly.
    message = 'You must change your password before continuing.'

    def has_permission(self, request, view):
        return not getattr(request.user, 'must_change_password', False)


_WORD_RE = re.compile(r'[a-z0-9]{4,}')


def _keywords(*texts):
    return set(_WORD_RE.findall(' '.join(t or '' for t in texts).lower()))


class RoleRequirementViewSet(
    AuditedDestroyMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated, PasswordChangeCompleted, IsSuperAdmin]
    pagination_class = PageSizeAwarePagination
    filterset_fields = ['status', 'assessed_role', 'review_outcome', 'reviewer_priority', 'submission_type']
    search_fields = ['stakeholder_designation', 'organizational_unit', 'problem_statement', 'desired_capability']
    ordering_fields = ['created_at', 'submitted_at', 'updated_at', 'reviewer_priority', 'assessed_role', 'status']
    ordering = ['-created_at']
    audit_delete_action = AuditAction.DELETE

    def _base_queryset(self):
        # Drafts are private to their recorder; everything else is visible to
        # every superadmin (all superadmins are potential reviewers).
        user = self.request.user
        return Submission.objects.filter(~Q(status=Status.DRAFT) | Q(created_by=user))

    def get_queryset(self):
        qs = self._base_queryset().select_related(
            'created_by', 'reviewed_by', 'verified_by',
        )
        params = self.request.query_params
        if params.get('mine') in ('true', '1'):
            qs = qs.filter(created_by=self.request.user)
        if params.get('dashboard_requested') in ('true', '1'):
            qs = qs.filter(
                Q(preferred_interface=Submission.PreferredInterface.DASHBOARD)
                | Q(consolidated_overview_needed=True)
            )
        if self.action == 'retrieve':
            qs = qs.prefetch_related('audit_logs__performed_by')
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return RoleRequirementListSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return RoleRequirementContentSerializer
        return RoleRequirementDetailSerializer

    def _detail_response(self, submission, status_code=status.HTTP_200_OK):
        fresh = (
            self._base_queryset()
            .select_related('created_by', 'reviewed_by', 'verified_by')
            .prefetch_related('audit_logs__performed_by')
            .get(pk=submission.pk)
        )
        data = RoleRequirementDetailSerializer(fresh, context=self.get_serializer_context()).data
        return Response(data, status=status_code)

    # ── Stakeholder form ────────────────────────────────────────────────

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            submission = serializer.save(created_by=request.user, status=Status.DRAFT)
            _log(submission, Action.CREATED, request.user, to_status=Status.DRAFT)
        return self._detail_response(submission, status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        with transaction.atomic():
            submission = self._locked_object()
            self._ensure_recorder(submission)
            if submission.status not in Submission.EDITABLE_STATUSES:
                raise ValidationError({
                    'detail': 'Only drafts or submissions awaiting clarification can be edited.'
                })
            before = _content_snapshot(submission)
            serializer = self.get_serializer(submission, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            submission = serializer.save()
            after = _content_snapshot(submission)
            changes = {f: {'old': before[f], 'new': after[f]} for f in CONTENT_FIELDS if before[f] != after[f]}
            # Once a submission has been submitted, every content change is
            # recorded with its previous value so nothing is altered silently.
            if changes and submission.submitted_at:
                submission.content_version += 1
                submission.save(update_fields=['content_version', 'updated_at'])
                _log(submission, Action.UPDATED, request.user,
                     from_status=submission.status, to_status=submission.status, changes=changes)
        return self._detail_response(submission)

    def perform_destroy(self, instance):
        self._ensure_recorder(instance)
        if instance.status != Status.DRAFT or instance.submitted_at:
            raise ValidationError({'detail': 'Only drafts that were never submitted can be deleted.'})
        super().perform_destroy(instance)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        with transaction.atomic():
            submission = self._locked_object()
            self._ensure_recorder(submission)
            self._ensure_transition(submission, Status.SUBMITTED)
            errors = completeness_errors(submission)
            if errors:
                raise ValidationError({'detail': 'The form is incomplete.', 'errors': errors})
            previous = submission.status
            submission.status = Status.SUBMITTED
            submission.submitted_at = timezone.now()
            submission.save(update_fields=['status', 'submitted_at', 'updated_at'])
            _log(submission, Action.SUBMITTED, request.user, from_status=previous, to_status=Status.SUBMITTED)
        return self._detail_response(submission)

    # ── Review decisions (never by the recorder) ────────────────────────

    @action(detail=True, methods=['post'])
    def start_review(self, request, pk=None):
        notes = request.data.get('notes', '')
        if not isinstance(notes, str) or len(notes) > 5000:
            raise ValidationError({'notes': 'Invalid notes.'})
        return self._transition(
            Status.UNDER_REVIEW, Action.REVIEW_STARTED, reviewer_only=True, notes=notes.strip(),
            apply=lambda s: (
                setattr(s, 'reviewed_by', request.user),
                setattr(s, 'review_started_at', timezone.now()),
            ),
            fields=['reviewed_by', 'review_started_at'],
        )

    @action(detail=True, methods=['post'])
    def request_clarification(self, request, pk=None):
        data = self._validated(ClarificationSerializer, request)
        return self._transition(
            Status.CLARIFICATION_REQUIRED, Action.CLARIFICATION_REQUESTED, reviewer_only=True,
            notes=data['clarification_request'],
            apply=lambda s: (
                setattr(s, 'clarification_request', data['clarification_request']),
                setattr(s, 'reviewed_by', request.user),
            ),
            fields=['clarification_request', 'reviewed_by'],
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        def apply(s):
            data = self._validated(ApproveSerializer, request, submission=s)
            for field in ('review_outcome', 'reviewer_priority', 'approved_acceptance_criteria',
                          'dashboard_decision_rationale', 'review_notes'):
                setattr(s, field, data[field])
            s.reviewed_by = request.user
            s.decided_at = timezone.now()
            return data['review_notes']

        return self._transition(
            Status.APPROVED, Action.APPROVED, reviewer_only=True, apply=apply,
            fields=['review_outcome', 'reviewer_priority', 'approved_acceptance_criteria',
                    'dashboard_decision_rationale', 'review_notes', 'reviewed_by', 'decided_at'],
        )

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        data = self._validated(RejectSerializer, request)

        def apply(s):
            s.rejection_reason = data['rejection_reason']
            if data['review_outcome']:
                s.review_outcome = data['review_outcome']
            s.reviewed_by = request.user
            s.decided_at = timezone.now()

        return self._transition(
            Status.REJECTED, Action.REJECTED, reviewer_only=True, apply=apply,
            notes=data['rejection_reason'],
            fields=['rejection_reason', 'review_outcome', 'reviewed_by', 'decided_at'],
        )

    @action(detail=True, methods=['post'])
    def add_note(self, request, pk=None):
        data = self._validated(NotesSerializer, request)
        with transaction.atomic():
            submission = self._locked_object()
            self._ensure_reviewer(submission)
            if submission.status == Status.DRAFT:
                raise ValidationError({'detail': 'Drafts cannot be reviewed.'})
            _log(submission, Action.NOTE_ADDED, request.user,
                 from_status=submission.status, to_status=submission.status, notes=data['notes'])
        return self._detail_response(submission)

    @action(detail=True, methods=['post'])
    def link_duplicate(self, request, pk=None):
        with transaction.atomic():
            submission = self._locked_object()
            self._ensure_reviewer(submission)
            if submission.status not in DUPLICATE_LINKABLE_STATUSES:
                raise ValidationError({'detail': 'Duplicates can only be linked before a decision is made.'})
            serializer = LinkDuplicateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            target = serializer.validated_data['duplicate_of']
            if target.pk == submission.pk or target.duplicate_of_id == submission.pk:
                raise ValidationError({'duplicate_of': 'A submission cannot duplicate itself.'})
            submission.duplicate_of = target
            submission.save(update_fields=['duplicate_of', 'updated_at'])
            _log(submission, Action.DUPLICATE_LINKED, request.user,
                 from_status=submission.status, to_status=submission.status,
                 changes={'duplicate_of': {'old': None, 'new': str(target.pk)}})
        return self._detail_response(submission)

    @action(detail=True, methods=['post'])
    def unlink_duplicate(self, request, pk=None):
        with transaction.atomic():
            submission = self._locked_object()
            self._ensure_reviewer(submission)
            if submission.status not in DUPLICATE_LINKABLE_STATUSES or not submission.duplicate_of_id:
                raise ValidationError({'detail': 'There is no duplicate link to remove.'})
            old = str(submission.duplicate_of_id)
            submission.duplicate_of = None
            submission.save(update_fields=['duplicate_of', 'updated_at'])
            _log(submission, Action.DUPLICATE_UNLINKED, request.user,
                 from_status=submission.status, to_status=submission.status,
                 changes={'duplicate_of': {'old': old, 'new': None}})
        return self._detail_response(submission)

    @action(detail=True, methods=['get'])
    def possible_duplicates(self, request, pk=None):
        """Suggest similar submissions (any role) by keyword overlap. Nothing
        is merged or discarded; a reviewer decides whether to link them."""
        submission = self.get_object()
        reference = _keywords(submission.problem_statement, submission.desired_capability)
        reference_caps = {c.get('capability') for c in submission.capabilities or []}
        if not reference:
            return Response([])
        candidates = (
            self._base_queryset()
            .exclude(pk=submission.pk)
            .exclude(status=Status.DRAFT)
            .only('id', 'assessed_role', 'status', 'problem_statement',
                  'desired_capability', 'capabilities')
        )
        matches = []
        for other in candidates:
            words = _keywords(other.problem_statement, other.desired_capability)
            if not words:
                continue
            score = len(reference & words) / len(reference | words)
            shared_caps = reference_caps & {c.get('capability') for c in other.capabilities or []}
            if score >= 0.2:
                matches.append({
                    'id': str(other.pk),
                    'assessed_role': other.assessed_role,
                    'assessed_role_label': other.get_assessed_role_display(),
                    'status': other.status,
                    'similarity': round(score, 2),
                    'shared_capabilities': sorted(c for c in shared_caps if c),
                    'problem_summary': (other.problem_statement or '')[:160],
                })
        matches.sort(key=lambda m: m['similarity'], reverse=True)
        return Response(matches[:10])

    # ── Delivery tracking ───────────────────────────────────────────────

    @action(detail=True, methods=['post'])
    def mark_in_development(self, request, pk=None):
        data = self._validated(ImplementationSerializer, request)

        def apply(s):
            # Approval already requires acceptance criteria; re-check so an
            # incomplete approval can never move into development.
            if not s.approved_acceptance_criteria.strip():
                raise ValidationError({'detail': 'Approved acceptance criteria are required before development.'})
            s.implementation_reference = data['implementation_reference'].strip()
            s.development_started_at = timezone.now()

        return self._transition(
            Status.IN_DEVELOPMENT, Action.DEVELOPMENT_STARTED, apply=apply,
            notes=data['notes'], fields=['implementation_reference', 'development_started_at'],
        )

    @action(detail=True, methods=['post'])
    def mark_implemented(self, request, pk=None):
        data = self._validated(NotesSerializer, request)
        return self._transition(
            Status.IMPLEMENTED, Action.IMPLEMENTED, notes=data['notes'],
            apply=lambda s: setattr(s, 'implemented_at', timezone.now()),
            fields=['implemented_at'],
        )

    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        data = self._validated(VerifySerializer, request)

        def apply(s):
            s.verification_notes = data['verification_notes']
            s.verified_by = request.user
            s.verified_at = timezone.now()

        return self._transition(
            Status.VERIFIED, Action.VERIFIED, notes=data['verification_notes'], apply=apply,
            fields=['verification_notes', 'verified_by', 'verified_at'],
        )

    # ── Role-level summary ──────────────────────────────────────────────

    @action(detail=False, methods=['get'])
    def role_summary(self, request):
        """Per-office summary built only from submitted records. Narrative
        content comes exclusively from reviewer-validated submissions; no
        names or contact details are included."""
        role_filter = request.query_params.get('assessed_role')
        if role_filter and role_filter not in Submission.AssessedRole.values:
            raise ValidationError({'assessed_role': 'Unknown role.'})
        qs = self._base_queryset().exclude(status=Status.DRAFT)
        if role_filter:
            qs = qs.filter(assessed_role=role_filter)
        qs = qs.only(
            'id', 'assessed_role', 'status', 'main_responsibilities', 'problem_statement',
            'desired_capability', 'capabilities', 'information_needs', 'preferred_interface',
            'consolidated_overview_needed', 'review_outcome', 'reviewer_priority',
            'dashboard_decision_rationale', 'clarification_request',
        )

        roles = [r for r in Submission.AssessedRole if not role_filter or r.value == role_filter]
        summaries = {
            r.value: {
                'assessed_role': r.value,
                'assessed_role_label': r.label,
                'submission_count': 0,
                'status_counts': {},
                'responsibilities': [],
                'problems': [],
                'desired_outcomes': [],
                'approved_requirements': [],
                'reporting_needs': [],
                'dashboard': {'requested': 0, 'justified': 0, 'not_justified': 0, 'decisions': []},
                'outstanding_questions': [],
                'awaiting_review': 0,
            }
            for r in roles
        }
        for s in qs:
            summary = summaries[s.assessed_role]
            summary['submission_count'] += 1
            summary['status_counts'][s.status] = summary['status_counts'].get(s.status, 0) + 1
            ref = str(s.pk)
            if s.dashboard_requested:
                summary['dashboard']['requested'] += 1
            if s.status in (Status.SUBMITTED, Status.UNDER_REVIEW):
                summary['awaiting_review'] += 1
            if s.status == Status.CLARIFICATION_REQUIRED and s.clarification_request:
                summary['outstanding_questions'].append({'submission': ref, 'text': s.clarification_request})
            if s.status not in VALIDATED_STATUSES:
                continue
            summary['responsibilities'].append({'submission': ref, 'text': s.main_responsibilities})
            summary['problems'].append({'submission': ref, 'text': s.problem_statement})
            summary['desired_outcomes'].append({'submission': ref, 'text': s.desired_capability})
            for cap in s.capabilities or []:
                summary['approved_requirements'].append({
                    'submission': ref,
                    'capability': cap.get('capability'),
                    'capability_label': CAPABILITY_TYPES.get(cap.get('capability'), ''),
                    'description': cap.get('description', ''),
                    'stakeholder_priority': cap.get('priority', ''),
                    'reviewer_priority': s.reviewer_priority,
                })
            for need in s.information_needs or []:
                summary['reporting_needs'].append({
                    'submission': ref,
                    'data_fields': need.get('data_fields', ''),
                    'formats': [INFORMATION_FORMATS.get(f, f) for f in need.get('formats', [])],
                    'update_frequency': need.get('update_frequency', ''),
                })
            if s.dashboard_requested or s.review_outcome == Submission.ReviewOutcome.DASHBOARD_JUSTIFIED:
                justified = s.review_outcome == Submission.ReviewOutcome.DASHBOARD_JUSTIFIED
                summary['dashboard']['justified' if justified else 'not_justified'] += 1
                summary['dashboard']['decisions'].append({
                    'submission': ref,
                    'justified': justified,
                    'rationale': s.dashboard_decision_rationale,
                })
        return Response(list(summaries.values()))

    @action(detail=False, methods=['get'])
    def choices(self, request):
        """Choice lists for the form so the UI never hard-codes labels."""
        def pairs(choices):
            return [{'value': value, 'label': label} for value, label in choices]

        return Response({
            'assessed_roles': pairs(Submission.AssessedRole.choices),
            'statuses': pairs(Submission.Status.choices),
            'submission_types': pairs(Submission.SubmissionType.choices),
            'frequencies': pairs(Submission.Frequency.choices),
            'preferred_interfaces': pairs(Submission.PreferredInterface.choices),
            'access_levels': pairs(Submission.AccessLevel.choices),
            'yes_no_unsure': pairs(Submission.YesNoUnsure.choices),
            'review_outcomes': pairs(Submission.ReviewOutcome.choices),
            'approvable_outcomes': sorted(Submission.APPROVABLE_OUTCOMES),
            'priorities': pairs(Submission.Priority.choices),
            'capability_types': pairs(CAPABILITY_TYPES.items()),
            'information_formats': pairs(INFORMATION_FORMATS.items()),
            'access_boundaries': pairs(ACCESS_BOUNDARIES.items()),
            'capture_methods': pairs([
                ('manual', 'Entered manually'), ('automatic', 'Retrieved automatically'),
                ('both', 'Both'), ('not_sure', 'Not sure'),
            ]),
        })

    # ── Helpers ─────────────────────────────────────────────────────────

    def _locked_object(self):
        """Fetch the object through the scoped queryset with a row lock, so two
        reviewers cannot act on the same submission concurrently."""
        lookup = self.kwargs[self.lookup_url_kwarg or self.lookup_field]
        try:
            pk = uuid.UUID(str(lookup))
            submission = self._base_queryset().select_for_update(of=('self',)).get(pk=pk)
        except (ValueError, Submission.DoesNotExist):
            raise Http404
        self.check_object_permissions(self.request, submission)
        return submission

    def _ensure_recorder(self, submission):
        if submission.created_by_id != self.request.user.id:
            raise PermissionDenied('Only the person who recorded this submission can change it.')

    def _ensure_reviewer(self, submission):
        if submission.created_by_id == self.request.user.id:
            raise PermissionDenied('You cannot review a submission you recorded.')

    def _ensure_transition(self, submission, new_status):
        if not submission.can_transition_to(new_status):
            raise ValidationError({
                'detail': (
                    f'Cannot move from "{submission.get_status_display()}" '
                    f'to "{Submission.Status(new_status).label}".'
                )
            })

    def _validated(self, serializer_class, request, **context):
        serializer = serializer_class(data=request.data, context=context)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data

    def _transition(self, new_status, action_name, *, apply, fields, reviewer_only=False, notes=''):
        with transaction.atomic():
            submission = self._locked_object()
            if reviewer_only:
                self._ensure_reviewer(submission)
            self._ensure_transition(submission, new_status)
            applied_notes = apply(submission)
            if isinstance(applied_notes, str) and applied_notes:
                notes = applied_notes
            previous = submission.status
            submission.status = new_status
            submission.save(update_fields=['status', 'updated_at', *fields])
            _log(submission, action_name, self.request.user,
                 from_status=previous, to_status=new_status, notes=notes)
        return self._detail_response(submission)
