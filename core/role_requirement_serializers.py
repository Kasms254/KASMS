import re

from rest_framework import serializers

from .models import RoleRequirementSubmission, RoleRequirementAuditLog

Submission = RoleRequirementSubmission

MAX_TEXT_LENGTH = 5000
MAX_ITEM_TEXT_LENGTH = 2000
MAX_LIST_ITEMS = 20
MAX_KEY_TASKS = 3

CAPABILITY_TYPES = {
    'view': 'View information',
    'search_filter': 'Search and filter records',
    'create': 'Create records',
    'update': 'Update records',
    'submit_review': 'Submit information for review',
    'approve_reject': 'Approve or reject requests',
    'track_status': 'Track progress and status',
    'generate_reports': 'Generate reports',
    'export': 'Export authorized information',
    'notifications': 'Receive notifications',
    'manage_assignments': 'Manage assignments or workflows',
    'other': 'Other requirement',
}

INFORMATION_FORMATS = {
    'table': 'Table',
    'summary': 'Summary',
    'printable': 'Printable report',
    'export': 'Export',
    'notification': 'Notification',
    'other': 'Other',
}

ACCESS_BOUNDARIES = {
    'school': 'School',
    'unit': 'Unit',
    'department': 'Department',
    'course': 'Course',
    'class': 'Class',
    'assigned_only': 'Assigned responsibilities only',
    'all_schools': 'Aggregated across schools',
    'other': 'Other',
}

CAPTURE_METHODS = {'manual', 'automatic', 'both', 'not_sure'}

# Text keys and choice keys accepted inside each JSON list item. Anything else
# is rejected so the JSON columns cannot be used to smuggle arbitrary data.
CAPABILITY_TEXT_KEYS = (
    'description', 'rationale', 'information_required', 'initiator',
    'actioned_by', 'expected_output', 'users_affected', 'impact_if_unresolved',
    'dependencies', 'acceptance_criteria',
)
CAPABILITY_CHOICE_KEYS = {
    'capability': set(CAPABILITY_TYPES),
    'frequency': set(Submission.Frequency.values),
    'priority': set(Submission.Priority.values),
}
INFORMATION_TEXT_KEYS = (
    'data_fields', 'source', 'filters', 'reporting_periods', 'authorized_viewers',
)
INFORMATION_CHOICE_KEYS = {
    'exists_in_kasms': set(Submission.YesNoUnsure.values),
    'capture_method': CAPTURE_METHODS,
    'update_frequency': set(Submission.Frequency.values),
}

# Fields a stakeholder (recorded by a superadmin) may write. Reviewer fields,
# status and timestamps are deliberately absent.
CONTENT_FIELDS = (
    'assessed_role',
    'stakeholder_name', 'stakeholder_designation', 'organizational_unit',
    'stakeholder_contact', 'validator_name', 'validator_designation',
    'submission_type', 'revises',
    'main_responsibilities', 'key_tasks', 'decisions_requiring_information',
    'time_consuming_activities', 'hard_to_obtain_information',
    'problem_statement', 'affected_people_processes', 'current_workflow',
    'current_tools', 'problem_frequency', 'problem_consequences',
    'estimated_effort_lost', 'partial_existing_feature', 'recent_example',
    'desired_capability', 'expected_improvement', 'measurable_result',
    'success_determination', 'baseline',
    'capabilities',
    'information_needs', 'sample_reports_description',
    'preferred_interface', 'preferred_interface_other',
    'consolidated_overview_needed', 'recurring_decisions', 'monitored_indicators',
    'indicator_change_frequency', 'threshold_actions',
    'alternatives_insufficient_reason', 'overview_usage_frequency',
    'access_records', 'access_level', 'access_boundaries', 'access_boundary_notes',
    'needs_approval_authority', 'needs_cross_unit_aggregates',
    'restricted_to_assignments', 'needs_audit_trail',
)

REVIEW_FIELDS = (
    'review_outcome', 'reviewer_priority', 'approved_acceptance_criteria',
    'dashboard_decision_rationale', 'review_notes', 'clarification_request',
    'rejection_reason', 'implementation_reference', 'verification_notes',
)

DASHBOARD_JUSTIFICATION_FIELDS = (
    'recurring_decisions', 'monitored_indicators', 'indicator_change_frequency',
    'threshold_actions', 'alternatives_insufficient_reason', 'overview_usage_frequency',
)

_FILLER_WORDS = {
    'a', 'an', 'the', 'i', 'we', 'me', 'us', 'my', 'our', 'to', 'for', 'of', 'and',
    'or', 'in', 'on', 'it', 'is', 'be', 'should', 'would', 'will', 'can', 'need',
    'needs', 'want', 'like', 'require', 'have', 'has', 'please', 'new', 'system',
    'kasms', 'dashboard', 'dashboards', 'page', 'office', 'that', 'this', 'with',
    'very', 'more', 'better', 'good', 'nice', 'easy', 'easier', 'use', 'user',
    'friendly', 'simple', 'fast', 'intuitive', 'modern', 'just', 'some', 'all',
}


def _words(text):
    return re.findall(r"[a-z0-9']+", (text or '').lower())


def is_vague_statement(text, min_words=8, min_substantive=4):
    """True when the text is too short or only expresses a wish ("I need a
    dashboard", "it should be user-friendly") instead of a concrete problem
    or an observable result."""
    words = _words(text)
    substantive = [w for w in words if w not in _FILLER_WORDS]
    return len(words) < min_words or len(substantive) < min_substantive


def _validate_items(value, label, text_keys, choice_keys, list_keys=None):
    list_keys = list_keys or {}
    if not isinstance(value, list):
        raise serializers.ValidationError(f'{label} must be a list.')
    if len(value) > MAX_LIST_ITEMS:
        raise serializers.ValidationError(f'{label} may contain at most {MAX_LIST_ITEMS} entries.')
    allowed = set(text_keys) | set(choice_keys) | set(list_keys)
    cleaned = []
    for index, item in enumerate(value, start=1):
        if not isinstance(item, dict):
            raise serializers.ValidationError(f'{label} entry {index} must be an object.')
        unknown = set(item) - allowed
        if unknown:
            raise serializers.ValidationError(
                f'{label} entry {index} has unsupported fields: {", ".join(sorted(unknown))}.'
            )
        entry = {}
        for key in text_keys:
            text = item.get(key, '')
            if text is None:
                text = ''
            if not isinstance(text, str):
                raise serializers.ValidationError(f'{label} entry {index}: "{key}" must be text.')
            if len(text) > MAX_ITEM_TEXT_LENGTH:
                raise serializers.ValidationError(
                    f'{label} entry {index}: "{key}" is longer than {MAX_ITEM_TEXT_LENGTH} characters.'
                )
            entry[key] = text.strip()
        for key, choices in choice_keys.items():
            choice = item.get(key) or ''
            if choice and choice not in choices:
                raise serializers.ValidationError(f'{label} entry {index}: invalid value for "{key}".')
            entry[key] = choice
        for key, choices in list_keys.items():
            selected = item.get(key) or []
            if not isinstance(selected, list) or any(s not in choices for s in selected):
                raise serializers.ValidationError(f'{label} entry {index}: invalid values for "{key}".')
            entry[key] = sorted(set(selected))
        cleaned.append(entry)
    return cleaned


def completeness_errors(submission):
    """Server-side checks a submission must pass before it can be submitted.
    Returns {field: message}; an empty dict means the submission is complete."""
    s = submission
    errors = {}

    def require(field, message='This field is required.'):
        value = getattr(s, field)
        if isinstance(value, str):
            value = value.strip()
        if not value:
            errors[field] = message

    # Section A
    for field in ('stakeholder_name', 'stakeholder_designation', 'organizational_unit',
                  'validator_name', 'validator_designation'):
        require(field)
    if s.submission_type == Submission.SubmissionType.REVISION and not s.revises_id:
        errors['revises'] = 'A revision must reference the submission it revises.'

    # Section B
    require('main_responsibilities')
    require('decisions_requiring_information')
    tasks = [t for t in (s.key_tasks or []) if isinstance(t, str) and t.strip()]
    if not tasks:
        errors['key_tasks'] = 'List at least one (and up to three) of the most important tasks.'

    # Section C
    if is_vague_statement(s.problem_statement):
        errors['problem_statement'] = (
            'Describe the specific operational problem (who is affected, what goes wrong). '
            'A request such as "I need a dashboard" is not a problem description.'
        )
    for field in ('affected_people_processes', 'current_workflow', 'problem_frequency',
                  'problem_consequences', 'recent_example'):
        require(field)

    # Section D
    for field in ('desired_capability', 'measurable_result', 'success_determination'):
        require(field)

    # Sections E + I
    if not s.capabilities:
        errors['capabilities'] = 'Add at least one functional requirement.'
    else:
        item_errors = []
        for index, cap in enumerate(s.capabilities, start=1):
            missing = [k for k in ('capability', 'description', 'rationale', 'initiator',
                                   'expected_output', 'frequency', 'priority')
                       if not cap.get(k)]
            if missing:
                item_errors.append(f'Requirement {index}: missing {", ".join(missing)}.')
            if is_vague_statement(cap.get('acceptance_criteria')):
                item_errors.append(
                    f'Requirement {index}: acceptance criteria must describe an observable, '
                    'testable result (at least one full sentence).'
                )
        if item_errors:
            errors['capabilities'] = ' '.join(item_errors)

    # Section F
    if not s.information_needs:
        errors['information_needs'] = 'Describe at least one information need.'
    else:
        item_errors = []
        for index, need in enumerate(s.information_needs, start=1):
            missing = [k for k in ('data_fields', 'authorized_viewers') if not need.get(k)]
            if not need.get('formats'):
                missing.append('formats')
            if missing:
                item_errors.append(f'Information need {index}: missing {", ".join(missing)}.')
        if item_errors:
            errors['information_needs'] = ' '.join(item_errors)

    # Section G — the justification questions are only mandatory when the
    # stakeholder asks for a dashboard or a consolidated overview.
    require('preferred_interface')
    if s.preferred_interface == Submission.PreferredInterface.OTHER:
        require('preferred_interface_other', 'Describe the preferred interface.')
    if s.dashboard_requested:
        for field in DASHBOARD_JUSTIFICATION_FIELDS:
            require(field, 'Required when a dashboard or consolidated overview is requested.')

    # Section H
    for field in ('access_records', 'access_level', 'needs_approval_authority',
                  'needs_cross_unit_aggregates', 'restricted_to_assignments', 'needs_audit_trail'):
        require(field)
    if not s.access_boundaries:
        errors['access_boundaries'] = 'Select at least one organizational boundary.'

    return errors


def _user_display(user):
    if not user:
        return None
    return user.get_full_name() or user.svc_number or user.username


class RoleRequirementContentSerializer(serializers.ModelSerializer):
    """Create/update serializer for the stakeholder form. Only CONTENT_FIELDS
    are writable; drafts may be partially complete."""

    class Meta:
        model = Submission
        fields = ('id',) + CONTENT_FIELDS
        read_only_fields = ('id',)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for name, field in self.fields.items():
            if isinstance(field, serializers.CharField) and field.max_length is None:
                field.max_length = MAX_TEXT_LENGTH
        # A revision may only point at a submission that has left draft.
        self.fields['revises'].queryset = Submission.objects.exclude(status=Submission.Status.DRAFT)

    def validate_key_tasks(self, value):
        if not isinstance(value, list) or any(not isinstance(t, str) for t in value):
            raise serializers.ValidationError('Key tasks must be a list of text entries.')
        if len(value) > MAX_KEY_TASKS:
            raise serializers.ValidationError(f'List at most {MAX_KEY_TASKS} tasks.')
        if any(len(t) > MAX_ITEM_TEXT_LENGTH for t in value):
            raise serializers.ValidationError(f'Each task must be under {MAX_ITEM_TEXT_LENGTH} characters.')
        return [t.strip() for t in value]

    def validate_capabilities(self, value):
        return _validate_items(value, 'Requirement', CAPABILITY_TEXT_KEYS, CAPABILITY_CHOICE_KEYS)

    def validate_information_needs(self, value):
        return _validate_items(
            value, 'Information need', INFORMATION_TEXT_KEYS, INFORMATION_CHOICE_KEYS,
            list_keys={'formats': set(INFORMATION_FORMATS)},
        )

    def validate_access_boundaries(self, value):
        if not isinstance(value, list) or any(v not in ACCESS_BOUNDARIES for v in value):
            raise serializers.ValidationError('Invalid organizational boundary.')
        return sorted(set(value))

    def validate(self, attrs):
        instance = self.instance
        if instance and instance.submitted_at and 'assessed_role' in attrs \
                and attrs['assessed_role'] != instance.assessed_role:
            raise serializers.ValidationError(
                {'assessed_role': 'The assessed role cannot change after first submission.'}
            )
        revises = attrs.get('revises', getattr(instance, 'revises', None))
        assessed_role = attrs.get('assessed_role', getattr(instance, 'assessed_role', None))
        if revises is not None:
            if instance and revises.pk == instance.pk:
                raise serializers.ValidationError({'revises': 'A submission cannot revise itself.'})
            if revises.assessed_role != assessed_role:
                raise serializers.ValidationError(
                    {'revises': 'A revision must belong to the same assessed role.'}
                )
        return attrs


class RoleRequirementAuditLogSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.SerializerMethodField()
    action_label = serializers.CharField(source='get_action_display', read_only=True)

    class Meta:
        model = RoleRequirementAuditLog
        fields = (
            'id', 'action', 'action_label', 'from_status', 'to_status',
            'performed_by_name', 'notes', 'changes', 'timestamp',
        )
        read_only_fields = fields

    def get_performed_by_name(self, obj):
        return _user_display(obj.performed_by)


class _SubmissionMetaMixin(serializers.Serializer):
    assessed_role_label = serializers.CharField(source='get_assessed_role_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()
    dashboard_requested = serializers.BooleanField(read_only=True)

    def get_created_by_name(self, obj):
        return _user_display(obj.created_by)

    def get_is_mine(self, obj):
        request = self.context.get('request')
        return bool(request and obj.created_by_id == request.user.id)


class RoleRequirementListSerializer(_SubmissionMetaMixin, serializers.ModelSerializer):
    problem_summary = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = (
            'id', 'assessed_role', 'assessed_role_label', 'status', 'status_label',
            'submission_type', 'stakeholder_designation', 'organizational_unit',
            'problem_summary', 'preferred_interface', 'dashboard_requested',
            'review_outcome', 'reviewer_priority', 'duplicate_of',
            'created_by_name', 'is_mine', 'content_version',
            'submitted_at', 'created_at', 'updated_at',
        )
        read_only_fields = fields

    def get_problem_summary(self, obj):
        text = (obj.problem_statement or '').strip()
        return text if len(text) <= 160 else text[:157] + '...'


class RoleRequirementDetailSerializer(_SubmissionMetaMixin, serializers.ModelSerializer):
    reviewed_by_name = serializers.SerializerMethodField()
    verified_by_name = serializers.SerializerMethodField()
    audit_logs = RoleRequirementAuditLogSerializer(many=True, read_only=True)
    completeness_errors = serializers.SerializerMethodField()
    allowed_actions = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = (
            ('id', 'status', 'status_label', 'assessed_role_label', 'dashboard_requested')
            + CONTENT_FIELDS + REVIEW_FIELDS
            + (
                'duplicate_of', 'content_version', 'created_by_name', 'is_mine',
                'reviewed_by_name', 'verified_by_name',
                'submitted_at', 'review_started_at', 'decided_at',
                'development_started_at', 'implemented_at', 'verified_at',
                'created_at', 'updated_at',
                'audit_logs', 'completeness_errors', 'allowed_actions',
            )
        )
        read_only_fields = fields

    def get_reviewed_by_name(self, obj):
        return _user_display(obj.reviewed_by)

    def get_verified_by_name(self, obj):
        return _user_display(obj.verified_by)

    def get_completeness_errors(self, obj):
        if obj.status not in Submission.EDITABLE_STATUSES:
            return {}
        return completeness_errors(obj)

    def get_allowed_actions(self, obj):
        request = self.context.get('request')
        if not request:
            return []
        from .role_requirement_views import allowed_actions_for
        return allowed_actions_for(obj, request.user)


class ClarificationSerializer(serializers.Serializer):
    clarification_request = serializers.CharField(max_length=MAX_TEXT_LENGTH)

    def validate_clarification_request(self, value):
        if len(_words(value)) < 4:
            raise serializers.ValidationError('State clearly what information is missing.')
        return value.strip()


class ApproveSerializer(serializers.Serializer):
    review_outcome = serializers.ChoiceField(choices=Submission.ReviewOutcome.choices)
    reviewer_priority = serializers.ChoiceField(choices=Submission.Priority.choices)
    approved_acceptance_criteria = serializers.CharField(max_length=MAX_TEXT_LENGTH)
    dashboard_decision_rationale = serializers.CharField(
        max_length=MAX_TEXT_LENGTH, required=False, allow_blank=True, default='',
    )
    review_notes = serializers.CharField(
        max_length=MAX_TEXT_LENGTH, required=False, allow_blank=True, default='',
    )

    def validate_review_outcome(self, value):
        if value not in Submission.APPROVABLE_OUTCOMES:
            raise serializers.ValidationError(
                'This outcome cannot be approved. Reject the request, or request '
                'clarification while it is investigated further.'
            )
        return value

    def validate_approved_acceptance_criteria(self, value):
        if is_vague_statement(value):
            raise serializers.ValidationError(
                'Acceptance criteria must describe observable, testable results.'
            )
        return value.strip()

    def validate(self, attrs):
        submission = self.context['submission']
        needs_rationale = (
            submission.dashboard_requested
            or attrs['review_outcome'] == Submission.ReviewOutcome.DASHBOARD_JUSTIFIED
        )
        if needs_rationale and is_vague_statement(attrs.get('dashboard_decision_rationale'), min_words=6, min_substantive=3):
            raise serializers.ValidationError({
                'dashboard_decision_rationale': (
                    'Explain why a dashboard is or is not justified by the workflow, '
                    'frequency of use and decisions involved.'
                )
            })
        return attrs


class RejectSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(max_length=MAX_TEXT_LENGTH)
    review_outcome = serializers.ChoiceField(
        choices=Submission.ReviewOutcome.choices, required=False, allow_blank=True, default='',
    )

    def validate_rejection_reason(self, value):
        if len(_words(value)) < 4:
            raise serializers.ValidationError('Record a clear reason for the rejection.')
        return value.strip()


class ImplementationSerializer(serializers.Serializer):
    implementation_reference = serializers.CharField(max_length=300)
    notes = serializers.CharField(max_length=MAX_TEXT_LENGTH, required=False, allow_blank=True, default='')


class NotesSerializer(serializers.Serializer):
    notes = serializers.CharField(max_length=MAX_TEXT_LENGTH)


class VerifySerializer(serializers.Serializer):
    verification_notes = serializers.CharField(max_length=MAX_TEXT_LENGTH)

    def validate_verification_notes(self, value):
        if len(_words(value)) < 4:
            raise serializers.ValidationError(
                'Record who confirmed the acceptance criteria and how.'
            )
        return value.strip()


class LinkDuplicateSerializer(serializers.Serializer):
    duplicate_of = serializers.PrimaryKeyRelatedField(
        queryset=Submission.objects.exclude(status=Submission.Status.DRAFT),
    )
