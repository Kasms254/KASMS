import io
import os
import base64
import logging
from datetime import date

from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from django.template.loader import render_to_string
from django.conf import settings

from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import (
    CommandantSchoolReport,
    CommandantReportAuditLog,
    PersonalNotification,
    User,
    School,
    Course,
    Class,
    Enrollment,
    SchoolMembership,
    ExamResult,
)
from .permissions import IsCommandant, IsChiefOfTraining, IsChiefOfTrainingOrSuperAdmin
from .report_serializers import (
    CommandantSchoolReportCreateSerializer,
    CommandantSchoolReportListSerializer,
    CommandantSchoolReportDetailSerializer,
)
from .services.report_service import CommandantReportService
from .views import PageSizeAwarePagination

from audit.mixins import AuditedDestroyMixin
from audit.constants import AuditAction
from .managers import get_current_school

logger = logging.getLogger(__name__)

def _get_school(user):
    school = get_current_school()
    return school if school else user.school


def _with_pct(qs):
    from django.db.models import ExpressionWrapper, F, FloatField
    from django.db.models.functions import Cast

    return qs.annotate(
        pct=ExpressionWrapper(
            Cast(F('marks_obtained'), FloatField()) * 100.0 / Cast(F('exam__total_marks'), FloatField()),
            output_field=FloatField(),
        )
    )


def _avg_percentage(qs):
    from django.db.models import Avg

    result = _with_pct(qs).aggregate(avg_pct=Avg('pct'))['avg_pct']
    return round(result, 1) if result is not None else None


def _months_before(d, months):
    """First-of-month date `months` months before `d`."""
    month = d.month - months
    year = d.year
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1)


def _audit(report, action, user, notes='', metadata=None):
    CommandantReportAuditLog.all_objects.create(
        report=report,
        school=report.school,
        action=action,
        performed_by=user,
        notes=notes,
        metadata=metadata or {},
    )


def _notify_cot_users(report):
    cot_users = User.all_objects.filter(
        role='chief_of_training', is_active=True
    )
    if not cot_users.exists():
        return
    commandant_display = report.commandant.get_full_name()
    if report.commandant.rank:
        commandant_display = (
            f"{report.commandant.get_rank_display()} {commandant_display}"
        )
    notifications = [
        PersonalNotification(
            school=None,  # COT is not school-scoped
            user=cot_user,
            notification_type='general',
            priority='high',
            title=f'New School Report Submitted — {report.school.name}',
            content=(
                f'{commandant_display} has submitted a school report for '
                f'{report.school.name} covering '
                f'{report.reporting_period_start.strftime("%b %Y")} to '
                f'{report.reporting_period_end.strftime("%b %Y")}.\n\n'
                f'Report: {report.title}'
            ),
            created_by=report.commandant,
            is_active=True,
        )
        for cot_user in cot_users
    ]
    PersonalNotification.all_objects.bulk_create(notifications)


class CommandantReportViewSet(AuditedDestroyMixin, viewsets.ModelViewSet):

    audit_delete_action = AuditAction.DELETE
    pagination_class = PageSizeAwarePagination
    permission_classes = [IsAuthenticated, IsCommandant]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status']
    search_fields = ['title', 'observations', 'challenges', 'achievements']
    ordering_fields = ['report_date', 'created_at', 'submitted_at']
    ordering = ['-report_date']

    def get_queryset(self):
        school = _get_school(self.request.user)
        if not school:
            return CommandantSchoolReport.objects.none()
        return (
            CommandantSchoolReport.all_objects.filter(school=school)
            .select_related('commandant', 'submitted_by', 'school')
        )

    def get_serializer_class(self):
        if self.action in ('create', 'partial_update', 'update'):
            return CommandantSchoolReportCreateSerializer
        if self.action == 'retrieve':
            return CommandantSchoolReportDetailSerializer
        return CommandantSchoolReportListSerializer

    def perform_create(self, serializer):
        user = self.request.user
        school = _get_school(user)
        if not school:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('No school context found for this user.')

        with transaction.atomic():
            report = serializer.save(
                school=school,
                commandant=user,
                status=CommandantSchoolReport.Status.DRAFT,
            )
            _audit(report, 'created', user, 'Report created as draft.')

    def perform_update(self, serializer):
        report = self.get_object()
        if report.status != CommandantSchoolReport.Status.DRAFT:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                'Only draft reports can be edited. '
                'A submitted report is locked.'
            )
        with transaction.atomic():
            serializer.save()
            _audit(report, 'updated', self.request.user, 'Report draft updated.')

    def destroy(self, request, *args, **kwargs):
        report = self.get_object()
        if report.status != CommandantSchoolReport.Status.DRAFT:
            return Response(
                {'error': 'Only draft reports may be deleted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
  
        report = self.get_object()
        if report.status != CommandantSchoolReport.Status.DRAFT:
            return Response(
                {'error': f'Report is already {report.status}. Only drafts can be submitted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            snapshot = CommandantReportService.compute_statistics(
                report.school,
                report.reporting_period_start,
                report.reporting_period_end,
            )
            report.statistics_snapshot = snapshot
            report.status = CommandantSchoolReport.Status.SUBMITTED
            report.submitted_at = timezone.now()
            report.submitted_by = request.user
            report.save(update_fields=[
                'statistics_snapshot', 'status',
                'submitted_at', 'submitted_by', 'updated_at',
            ])
            _audit(report, 'submitted', request.user, 'Report submitted.')

        try:
            _notify_cot_users(report)
        except Exception as exc:
            logger.warning(f'COT notification failed for report {report.id}: {exc}')

        serializer = CommandantSchoolReportDetailSerializer(
            report, context={'request': request}
        )
        return Response(
            {'message': 'Report submitted successfully.', 'report': serializer.data},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['get'])
    def statistics(self, request, pk=None):
        report = self.get_object()
        if report.statistics_snapshot:
            data = report.statistics_snapshot
        else:
            data = CommandantReportService.compute_statistics(
                report.school,
                report.reporting_period_start,
                report.reporting_period_end,
            )
        return Response(data)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Download the report as a PDF. Commandant can only download their own school's reports."""
        report = self.get_object()
        try:
            pdf_bytes = CommandantReportPDFGenerator(report).generate()
        except Exception as exc:
            logger.error(f'PDF generation failed for report {report.id}: {exc}', exc_info=True)
            return Response(
                {'error': 'Failed to generate PDF.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        safe_title = report.title.replace(' ', '_').replace('/', '_')[:50]
        _audit(report, 'pdf_downloaded', request.user)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'attachment; filename="report_{safe_title}.pdf"'
        )
        return response

class ChiefOfTrainingViewSet(viewsets.ReadOnlyModelViewSet):

    pagination_class = PageSizeAwarePagination
    permission_classes = [IsAuthenticated, IsChiefOfTrainingOrSuperAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'school', 'commandant', 'reporting_period_start', 'reporting_period_end']
    search_fields = ['title', 'school__name', 'school__code', 'commandant__first_name', 'commandant__last_name', 'commandant__svc_number']
    ordering_fields = ['report_date', 'submitted_at', 'created_at', 'school__name']
    ordering = ['-submitted_at', '-report_date']

    def get_queryset(self):
        return (
            CommandantSchoolReport.all_objects
            .filter(status__in=[
                CommandantSchoolReport.Status.SUBMITTED,
                CommandantSchoolReport.Status.REVIEWED,
                CommandantSchoolReport.Status.ARCHIVED,
            ])
            .select_related('commandant', 'submitted_by', 'school')
            .order_by('-submitted_at', '-report_date')
        )

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return CommandantSchoolReportDetailSerializer
        return CommandantSchoolReportListSerializer

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """Summary statistics across all schools for the COT dashboard."""
        from django.db.models import Count

        qs = CommandantSchoolReport.all_objects.exclude(
            status=CommandantSchoolReport.Status.DRAFT
        )

        total = qs.count()
        by_status = dict(
            qs.values_list('status').annotate(count=Count('id'))
        )
        by_school = list(
            qs.values(
                school_name=F('school__name'),
                school_code=F('school__code'),
            )
            .annotate(report_count=Count('id'))
            .order_by('school_name')
        )
        recent = (
            qs.filter(status=CommandantSchoolReport.Status.SUBMITTED)
            .select_related('school', 'commandant')
            .order_by('-submitted_at')[:10]
        )
        recent_data = CommandantSchoolReportListSerializer(
            recent, many=True, context={'request': request}
        ).data

        return Response({
            'total_reports': total,
            'by_status': by_status,
            'by_school': by_school,
            'recent_submissions': recent_data,
        })

    @action(detail=False, methods=['get'])
    def analytics(self, request):

        from django.db.models import Avg, Count, Q
        from django.db.models.functions import TruncMonth

        today = timezone.localdate()
        exam_result_base = ExamResult.all_objects.filter(
            is_submitted=True, marks_obtained__isnull=False, exam__total_marks__gt=0,
        )
        active_schools = list(School.objects.filter(is_active=True))

        overview = {
            'total_schools': len(active_schools),
            'total_courses': Course.all_objects.filter(is_active=True).count(),
            'active_students': SchoolMembership.all_objects.filter(
                role='student', status='active'
            ).count(),
            'running_classes': Class.all_objects.filter(
                is_active=True, is_closed=False,
                start_date__lte=today, end_date__gte=today,
            ).count(),
            'total_classes': Class.all_objects.count(),
            'graduates': Enrollment.all_objects.filter(completion_date__isnull=False).count(),
            'avg_performance': _avg_percentage(exam_result_base),
        }

        courses_by_school = dict(
            Course.all_objects.filter(is_active=True)
            .values_list('school').annotate(c=Count('id')).values_list('school', 'c')
        )
        active_students_by_school = dict(
            SchoolMembership.all_objects.filter(role='student', status='active')
            .values_list('school').annotate(c=Count('id')).values_list('school', 'c')
        )
        instructors_by_school = dict(
            SchoolMembership.all_objects.filter(role='instructor', status='active')
            .values_list('school').annotate(c=Count('id')).values_list('school', 'c')
        )
        running_by_school = dict(
            Class.all_objects.filter(
                is_active=True, is_closed=False,
                start_date__lte=today, end_date__gte=today,
            ).values_list('school').annotate(c=Count('id')).values_list('school', 'c')
        )
        completed_by_school = dict(
            Class.all_objects.filter(Q(is_closed=True) | Q(end_date__lt=today))
            .values_list('school').annotate(c=Count('id')).values_list('school', 'c')
        )
        graduates_by_school = dict(
            Enrollment.all_objects.filter(completion_date__isnull=False)
            .values_list('school').annotate(c=Count('id')).values_list('school', 'c')
        )
        perf_by_school = {
            row['school']: round(row['avg_pct'], 1) if row['avg_pct'] is not None else None
            for row in _with_pct(exam_result_base).values('school').annotate(avg_pct=Avg('pct'))
        }

        by_school = []
        for school in active_schools:
            by_school.append({
                'school_id': str(school.id),
                'school_name': school.name,
                'school_code': school.code,
                'courses': courses_by_school.get(school.id, 0),
                'active_students': active_students_by_school.get(school.id, 0),
                'instructors': instructors_by_school.get(school.id, 0),
                'running_classes': running_by_school.get(school.id, 0),
                'completed_classes': completed_by_school.get(school.id, 0),
                'graduates': graduates_by_school.get(school.id, 0),
                'avg_performance': perf_by_school.get(school.id),
            })
        by_school.sort(key=lambda s: s['active_students'], reverse=True)

        enrollment_rows = (
            Enrollment.all_objects.filter(is_active=True, class_obj__course__isnull=False)
            .values(
                course_name=F('class_obj__course__name'),
                school_pk=F('school'),
                school_name=F('school__name'),
                school_code=F('school__code'),
            )
            .annotate(students=Count('id', distinct=True))
        )
        course_perf_by_school = {
            (row['course_name'], row['school_pk']): (
                round(row['avg_pct'], 1) if row['avg_pct'] is not None else None
            )
            for row in _with_pct(exam_result_base)
            .values(
                course_name=F('exam__subject__class_obj__course__name'),
                school_pk=F('school'),
            )
            .annotate(avg_pct=Avg('pct'))
        }

        courses_map = {}
        for row in enrollment_rows:
            name = row['course_name']
            if not name:
                continue
            entry = courses_map.setdefault(name, {'course': name, 'schools': [], 'total_students': 0})
            entry['schools'].append({
                'school_id': str(row['school_pk']),
                'school_name': row['school_name'],
                'school_code': row['school_code'],
                'students': row['students'],
                'avg_performance': course_perf_by_school.get((name, row['school_pk'])),
            })
            entry['total_students'] += row['students']

        course_comparison = []
        for name, entry in courses_map.items():
            school_count = len(entry['schools'])
            perfs = [s['avg_performance'] for s in entry['schools'] if s['avg_performance'] is not None]
            course_comparison.append({
                'course': name,
                'multi_school': school_count > 1,
                'school_count': school_count,
                'total_students': entry['total_students'],
                'avg_performance': round(sum(perfs) / len(perfs), 1) if perfs else None,
                'schools': entry['schools'],
            })
        course_comparison.sort(key=lambda c: c['total_students'], reverse=True)

        # ---- Graduate output trend (last 12 months) ----
        start_month = _months_before(today, 11)
        trend_rows = (
            Enrollment.all_objects
            .filter(completion_date__isnull=False, completion_date__gte=start_month)
            .annotate(month=TruncMonth('completion_date'))
            .values('month')
            .annotate(graduates=Count('id'))
        )
        trend_map = {row['month'].strftime('%Y-%m'): row['graduates'] for row in trend_rows}

        output_trend = []
        cursor = start_month
        for _ in range(12):
            key = cursor.strftime('%Y-%m')
            output_trend.append({'month': key, 'graduates': trend_map.get(key, 0)})
            cursor = date(cursor.year + (1 if cursor.month == 12 else 0),
                           1 if cursor.month == 12 else cursor.month + 1, 1)

        return Response({
            'overview': overview,
            'by_school': by_school,
            'course_comparison': course_comparison,
            'output_trend': output_trend,
        })

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Download a report as PDF. Authorized for COT and superadmin only."""
        report = self.get_object()
        try:
            pdf_bytes = CommandantReportPDFGenerator(report).generate()
        except Exception as exc:
            logger.error(f'PDF generation failed for COT report {report.id}: {exc}', exc_info=True)
            return Response(
                {'error': 'Failed to generate PDF.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        safe_title = report.title.replace(' ', '_').replace('/', '_')[:50]
        _audit(report, 'pdf_downloaded', request.user)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'attachment; filename="report_{safe_title}.pdf"'
        )
        return response

# Needed for F() in COT viewset dashboard action
from django.db.models import F


REPORT_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{title}</title>
<style>
  @page {{
    size: A4;
    margin: 20mm 18mm 20mm 18mm;
    @bottom-right {{
      content: "Page " counter(page) " of " counter(pages);
      font-size: 9pt;
      color: #666;
    }}
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: "DejaVu Sans", Arial, sans-serif;
    font-size: 10pt;
    color: #1a1a1a;
    line-height: 1.5;
  }}
  /* Header */
  .report-header {{
    display: flex;
    align-items: center;
    border-bottom: 3px solid {primary_color};
    padding-bottom: 10px;
    margin-bottom: 16px;
  }}
  .header-logo {{
    max-height: 70px;
    max-width: 80px;
    margin-right: 16px;
  }}
  .header-text {{ flex: 1; }}
  .header-text h1 {{
    font-size: 15pt;
    color: {primary_color};
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }}
  .header-text p {{
    font-size: 9pt;
    color: #555;
    margin-top: 2px;
  }}
  .report-number {{
    text-align: right;
    font-size: 8pt;
    color: #888;
    min-width: 120px;
  }}

  /* Classification banner */
  .classification {{
    background-color: {primary_color};
    color: white;
    text-align: center;
    padding: 4px 0;
    font-size: 9pt;
    font-weight: bold;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 14px;
  }}

  /* Section headings */
  .section-title {{
    background-color: {primary_color};
    color: white;
    font-size: 10pt;
    font-weight: bold;
    padding: 5px 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 14px;
    margin-bottom: 8px;
  }}

  /* Info table */
  .info-table {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
  }}
  .info-table td {{
    padding: 4px 8px;
    border: 1px solid #ddd;
    font-size: 9.5pt;
    vertical-align: top;
  }}
  .info-table td:first-child {{
    font-weight: bold;
    width: 38%;
    background-color: #f5f7fa;
    color: #333;
  }}

  /* Stats grid */
  .stats-grid {{
    display: table;
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
  }}
  .stats-row {{ display: table-row; }}
  .stat-box {{
    display: table-cell;
    border: 1px solid #ddd;
    padding: 8px 10px;
    text-align: center;
    width: 25%;
    vertical-align: middle;
  }}
  .stat-value {{
    font-size: 18pt;
    font-weight: bold;
    color: {primary_color};
    display: block;
  }}
  .stat-label {{
    font-size: 8pt;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    display: block;
    margin-top: 2px;
  }}

  /* Course breakdown table */
  .data-table {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
    font-size: 9pt;
  }}
  .data-table th {{
    background-color: {secondary_color};
    color: white;
    padding: 5px 8px;
    text-align: left;
    font-weight: bold;
  }}
  .data-table td {{
    padding: 4px 8px;
    border-bottom: 1px solid #eee;
    vertical-align: top;
  }}
  .data-table tr:nth-child(even) td {{ background-color: #f9f9f9; }}

  /* Ratio highlight */
  .ratio-box {{
    background-color: #f0f4f9;
    border-left: 4px solid {primary_color};
    padding: 8px 12px;
    margin: 8px 0;
    font-size: 10pt;
  }}
  .ratio-box strong {{ color: {primary_color}; font-size: 12pt; }}

  /* Performance bar */
  .perf-bar-wrapper {{
    background-color: #e0e0e0;
    border-radius: 4px;
    height: 14px;
    margin: 4px 0 8px 0;
    overflow: hidden;
  }}
  .perf-bar {{
    background-color: {primary_color};
    height: 100%;
    border-radius: 4px;
  }}
  .perf-label {{
    font-size: 9pt;
    color: #333;
    margin-bottom: 2px;
  }}

  /* Narrative sections */
  .narrative-box {{
    border: 1px solid #ddd;
    border-radius: 3px;
    padding: 8px 12px;
    margin-bottom: 8px;
    font-size: 9.5pt;
    line-height: 1.6;
    min-height: 30px;
  }}
  .narrative-box.empty {{ color: #aaa; font-style: italic; }}
  .narrative-label {{
    font-weight: bold;
    font-size: 9pt;
    color: {primary_color};
    margin-bottom: 4px;
    text-transform: uppercase;
  }}

  /* Footer */
  .report-footer {{
    margin-top: 20px;
    border-top: 2px solid {primary_color};
    padding-top: 8px;
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    color: #666;
  }}
  .signature-section {{
    margin-top: 30px;
    display: flex;
    justify-content: space-between;
  }}
  .sig-block {{
    text-align: center;
    width: 42%;
  }}
  .sig-line {{
    border-top: 1px solid #333;
    margin-bottom: 4px;
    margin-top: 40px;
  }}
  .sig-name {{ font-weight: bold; font-size: 9.5pt; }}
  .sig-title {{ font-size: 8.5pt; color: #555; }}
</style>
</head>
<body>

<!-- Classification -->
<div class="classification">OFFICIAL — KASMS SCHOOL REPORT</div>

<!-- Header -->
<div class="report-header">
  {logo_section}
  <div class="header-text">
    <h1>{school_name}</h1>
    <p>Commandant's School Report</p>
    <p>Reporting Period: {period_start} — {period_end}</p>
  </div>
  <div class="report-number">
    <div>Date: {report_date}</div>
    <div>Status: {status_display}</div>
    {submitted_line}
  </div>
</div>

<!-- Section 1: Report Identification -->
<div class="section-title">1. Report Identification</div>
<table class="info-table">
  <tr><td>Report Title</td><td>{title}</td></tr>
  <tr><td>School Name</td><td>{school_name}</td></tr>
  <tr><td>School Code</td><td>{school_code}</td></tr>
  <tr><td>Report Date</td><td>{report_date}</td></tr>
  <tr><td>Reporting Period</td><td>{period_start} to {period_end}</td></tr>
  <tr><td>Commandant</td><td>{commandant_display}</td></tr>
  <tr><td>Report Status</td><td>{status_display}</td></tr>
</table>

<!-- Section 2: School Statistics -->
<div class="section-title">2. School Statistics</div>

<div style="font-weight:bold; font-size:9pt; margin:6px 0 4px 0; color:#444;">2.1 Student Strength</div>
<div class="stats-grid">
  <div class="stats-row">
    <div class="stat-box">
      <span class="stat-value">{total_students}</span>
      <span class="stat-label">Total Students</span>
    </div>
    <div class="stat-box">
      <span class="stat-value">{active_students}</span>
      <span class="stat-label">Active Students</span>
    </div>
    <div class="stat-box">
      <span class="stat-value">{total_instructors}</span>
      <span class="stat-label">Total Instructors</span>
    </div>
    <div class="stat-box">
      <span class="stat-value">{active_instructors}</span>
      <span class="stat-label">Active Instructors</span>
    </div>
  </div>
</div>

<div style="font-weight:bold; font-size:9pt; margin:10px 0 4px 0; color:#444;">2.2 Courses &amp; Classes</div>
<div class="stats-grid">
  <div class="stats-row">
    <div class="stat-box">
      <span class="stat-value">{total_courses}</span>
      <span class="stat-label">Total Courses</span>
    </div>
    <div class="stat-box">
      <span class="stat-value">{running_classes}</span>
      <span class="stat-label">Currently Running</span>
    </div>
    <div class="stat-box">
      <span class="stat-value">{completed_classes}</span>
      <span class="stat-label">Completed</span>
    </div>
    <div class="stat-box">
      <span class="stat-value">{upcoming_classes}</span>
      <span class="stat-label">Upcoming</span>
    </div>
  </div>
</div>

<!-- Students per course -->
{students_per_course_table}

<!-- Section 3: Instructor/Student Ratio -->
<div class="section-title">3. Instructor / Student Ratio</div>
<div class="ratio-box">
  <strong>{ratio_text}</strong>
  <div style="font-size:9pt; color:#555; margin-top:4px;">{ratio_note}</div>
</div>

<!-- Section 4: School Average Performance -->
<div class="section-title">4. School Academic Performance</div>
<div class="perf-label">School Average Performance: <strong>{avg_pct}%</strong></div>
<div class="perf-bar-wrapper">
  <div class="perf-bar" style="width:{bar_width}%;"></div>
</div>
<p style="font-size:8.5pt; color:#666;">
  Based on submitted examination results for the reporting period
  ({period_start} — {period_end}).
</p>

<!-- Narrative starts on a new page -->
<div class="classification" style="page-break-before: always;">OFFICIAL — KASMS SCHOOL REPORT</div>

<!-- Section 5: Commandant's Narrative -->
<div class="section-title">5. Commandant's Narrative Report</div>

<div class="narrative-label">5.1 Observations</div>
<div class="narrative-box {obs_empty_class}">{observations}</div>

<div class="narrative-label">5.2 Challenges</div>
<div class="narrative-box {chall_empty_class}">{challenges}</div>

<div class="narrative-label">5.3 Achievements</div>
<div class="narrative-box {achiev_empty_class}">{achievements}</div>

<div class="narrative-label">5.4 Recommendations</div>
<div class="narrative-box {rec_empty_class}">{recommendations}</div>

<div class="narrative-label">5.5 Overall Remarks</div>
<div class="narrative-box {rem_empty_class}">{overall_remarks}</div>

<!-- Signature -->
<div class="signature-section">
  <div class="sig-block">
    <div class="sig-line"></div>
    <div class="sig-name">{commandant_display}</div>
    <div class="sig-title">Commandant, {school_name}</div>
  </div>
  <div class="sig-block">
    <div class="sig-line"></div>
    <div class="sig-name">Chief of Training</div>
    <div class="sig-title">Reviewed &amp; Acknowledged</div>
  </div>
</div>

<!-- Footer -->
<div class="report-footer">
  <span>KASMS — Kenya Army School Management System</span>
  <span>Generated: {generated_at}</span>
</div>

</body>
</html>"""


class CommandantReportPDFGenerator:

    def __init__(self, report: CommandantSchoolReport):
        self.report = report

    def generate(self) -> bytes:
        html = self._build_html()
        try:
            from weasyprint import HTML as WeasyprintHTML
            return WeasyprintHTML(string=html).write_pdf()
        except ImportError:
            logger.error('WeasyPrint is not installed. PDF generation unavailable.')
            raise RuntimeError('WeasyPrint is required for PDF generation.')

    def _build_html(self) -> str:
        report = self.report
        school = report.school

        # Statistics
        if report.statistics_snapshot:
            stats = report.statistics_snapshot
        else:
            stats = CommandantReportService.compute_statistics(
                school,
                report.reporting_period_start,
                report.reporting_period_end,
            )

        students = stats.get('students', {})
        courses = stats.get('courses', {})
        instructors = stats.get('instructors', {})
        performance = stats.get('performance', {})
        ratio_info = instructors.get('ratio', {})

        avg_pct = performance.get('school_average_percentage', 0) or 0
        bar_width = min(float(avg_pct), 100)

        # KASMS command documents always use the army maroon branding
        primary_color = '#7B1A1A'
        secondary_color = '#4a0f0f'

        # Logo as base64
        logo_section = ''
        if school.logo:
            try:
                logo_path = os.path.join(settings.MEDIA_ROOT, str(school.logo))
                if os.path.exists(logo_path):
                    with open(logo_path, 'rb') as f:
                        logo_b64 = base64.b64encode(f.read()).decode()
                    ext = os.path.splitext(str(school.logo))[1].lstrip('.').lower()
                    mime = 'image/png' if ext == 'png' else 'image/jpeg'
                    logo_section = (
                        f'<img src="data:{mime};base64,{logo_b64}" class="header-logo" alt="Logo">'
                    )
            except Exception:
                pass

        # Commandant display
        cdt = report.commandant
        rank_display = cdt.get_rank_display() if cdt.rank else ''
        commandant_display = f"{rank_display} {cdt.get_full_name()}".strip()
        if cdt.svc_number:
            commandant_display = f"{commandant_display} ({cdt.svc_number})"

        # Submitted line
        submitted_line = ''
        if report.submitted_at:
            submitted_line = (
                f'<div>Submitted: {report.submitted_at.strftime("%d %b %Y %H:%M")}</div>'
            )

        # Students per course table
        per_course = students.get('per_course', [])
        if per_course:
            rows = ''.join(
                f'<tr><td>{r["course_name"]}</td><td>{r["course_code"]}</td>'
                f'<td style="text-align:center">{r["student_count"]}</td></tr>'
                for r in per_course
            )
            students_per_course_table = f"""
<div style="font-weight:bold; font-size:9pt; margin:10px 0 4px 0; color:#444;">2.3 Students by Course</div>
<table class="data-table">
  <thead>
    <tr><th>Course</th><th>Code</th><th>Students</th></tr>
  </thead>
  <tbody>{rows}</tbody>
</table>"""
        else:
            students_per_course_table = (
                '<p style="font-size:9pt; color:#888; margin:6px 0 10px;">No enrollment data available for this period.</p>'
            )

        def _or_empty(text, empty_label):
            if text and text.strip():
                return text.replace('\n', '<br>'), ''
            return f'No {empty_label} recorded.', 'empty'

        obs, obs_cls = _or_empty(report.observations, 'observations')
        chall, chall_cls = _or_empty(report.challenges, 'challenges')
        achiev, achiev_cls = _or_empty(report.achievements, 'achievements')
        rec, rec_cls = _or_empty(report.recommendations, 'recommendations')
        rem, rem_cls = _or_empty(report.overall_remarks, 'overall remarks')

        return REPORT_HTML_TEMPLATE.format(
            title=report.title,
            school_name=school.name,
            school_code=school.code,
            primary_color=primary_color,
            secondary_color=secondary_color,
            logo_section=logo_section,
            report_date=report.report_date.strftime('%d %b %Y'),
            period_start=report.reporting_period_start.strftime('%d %b %Y'),
            period_end=report.reporting_period_end.strftime('%d %b %Y'),
            status_display=report.get_status_display(),
            submitted_line=submitted_line,
            commandant_display=commandant_display,
            total_students=students.get('total', 0),
            active_students=students.get('active', 0),
            total_instructors=instructors.get('total', 0),
            active_instructors=instructors.get('active', 0),
            total_courses=courses.get('total', 0),
            running_classes=courses.get('running', 0),
            completed_classes=courses.get('completed', 0),
            upcoming_classes=courses.get('upcoming', 0),
            students_per_course_table=students_per_course_table,
            ratio_text=ratio_info.get('ratio_text', 'N/A'),
            ratio_note=(
                f"Based on {instructors.get('active', 0)} active instructors "
                f"and {students.get('active', 0)} active students."
            ),
            avg_pct=f'{avg_pct:.1f}',
            bar_width=bar_width,
            observations=obs,
            challenges=chall,
            achievements=achiev,
            recommendations=rec,
            overall_remarks=rem,
            obs_empty_class=obs_cls,
            chall_empty_class=chall_cls,
            achiev_empty_class=achiev_cls,
            rec_empty_class=rec_cls,
            rem_empty_class=rem_cls,
            generated_at=timezone.now().strftime('%d %b %Y %H:%M UTC'),
        )
