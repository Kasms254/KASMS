from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, SAFE_METHODS
from django.db.models import (
    Avg, Count, Q, F, Sum, Max, Min,
    FloatField, CharField, Case, When, Value,
)
from django.utils import timezone
from django.core.cache import cache
from datetime import timedelta

from .models import (
    Exam, ExamResult, Subject, Class, Enrollment, User,
    Attendance, AttendanceSession, SessionAttendance,
)
from .serializers import (
    ExamSerializer, ExamResultSerializer, SubjectSerializer, EnrollmentSerializer,
)
from .permissions import IsAdminOrInstructor, IsAdminOrCommandant

def _calculate_grade(percentage):
    if percentage >= 91: return 'A'
    if percentage >= 86: return 'A-'
    if percentage >= 81: return 'B+'
    if percentage >= 76: return 'B'
    if percentage >= 71: return 'B-'
    if percentage >= 65: return 'C+'
    if percentage >= 60: return 'C'
    if percentage >= 50: return 'C-'
    return 'F'


def _interpret_correlation(correlation):
    abs_corr = abs(correlation)
    direction = "positive" if correlation > 0 else "negative"
    if abs_corr >= 0.7:   strength = "strong"
    elif abs_corr >= 0.4: strength = "moderate"
    elif abs_corr >= 0.2: strength = "weak"
    else:                 strength = "very weak or no"
    return f"There is a {strength} {direction} correlation between attendance and exam performance."

PCT_EXPR = F('marks_obtained') * 100.0 / F('exam__total_marks')

GRADE_BUCKET_EXPR = Case(
    When(marks_obtained__gte=F('exam__total_marks') * 0.91, then=Value('A')),
    When(marks_obtained__gte=F('exam__total_marks') * 0.86, then=Value('A-')),
    When(marks_obtained__gte=F('exam__total_marks') * 0.81, then=Value('B+')),
    When(marks_obtained__gte=F('exam__total_marks') * 0.76, then=Value('B')),
    When(marks_obtained__gte=F('exam__total_marks') * 0.71, then=Value('B-')),
    When(marks_obtained__gte=F('exam__total_marks') * 0.65, then=Value('C+')),
    When(marks_obtained__gte=F('exam__total_marks') * 0.60, then=Value('C')),
    When(marks_obtained__gte=F('exam__total_marks') * 0.50, then=Value('C-')),
    default=Value('F'),
    output_field=CharField(),
)

def _grade_distribution_sql(result_qs):
    rows = result_qs.annotate(gb=GRADE_BUCKET_EXPR).values('gb').annotate(c=Count('id'))
    dist = {'A': 0, 'A-': 0, 'B+': 0, 'B': 0, 'B-': 0, 'C+': 0, 'C': 0, 'C-': 0, 'F': 0}
    for r in rows:
        if r['gb'] in dist:
            dist[r['gb']] = r['c']
    return dist


def _student_exam_map(result_qs):
    rows = result_qs.values('student_id').annotate(
        total_marks=Sum('marks_obtained'),
        total_possible=Sum('exam__total_marks'),
        exams_taken=Count('id'),
        passing_count=Count('id', filter=Q(marks_obtained__gte=F('exam__total_marks') * 0.5)),
    )
    return {r['student_id']: r for r in rows}


def _student_subject_exam_map(result_qs):
    rows = result_qs.values('student_id', 'exam__subject_id').annotate(
        total_marks=Sum('marks_obtained'),
        total_possible=Sum('exam__total_marks'),
        exams_taken=Count('id'),
    )
    out = {}
    for r in rows:
        out.setdefault(r['student_id'], {})[r['exam__subject_id']] = r
    return out


def _student_att_map(att_qs):
    rows = att_qs.values('student_id').annotate(
        attended=Count('id'),
        present=Count('id', filter=Q(status='present')),
        late=Count('id', filter=Q(status='late')),
        excused=Count('id', filter=Q(status='excused')),
    )
    return {r['student_id']: r for r in rows}


def _student_subject_att_map(att_qs):
    rows = att_qs.values('student_id', 'session__subject_id').annotate(
        attended=Count('id'),
        present=Count('id', filter=Q(status='present')),
        late=Count('id', filter=Q(status='late')),
    )
    out = {}
    for r in rows:
        out.setdefault(r['student_id'], {})[r['session__subject_id']] = r
    return out


def _subject_session_counts(class_obj):
    rows = (
        AttendanceSession.objects
        .filter(class_obj=class_obj, status__in=['active', 'completed'])
        .values('subject_id')
        .annotate(cnt=Count('id'))
    )
    return {r['subject_id']: r['cnt'] for r in rows}


def _get_school_from_request(request):
    return getattr(request, 'school', None)


class IsAnalyticsViewer(IsAuthenticated):

    ADMIN_ROLES = ('admin', 'superadmin')
    READONLY_ROLES = ('commandant', 'chief_instructor', 'instructor')

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        role = getattr(request.user, 'role', None)
        if role in self.ADMIN_ROLES:
            return True
        if role in self.READONLY_ROLES:
            return request.method in ('GET', 'HEAD', 'OPTIONS')
        return False



class _ClassAccessMixin:

    def _has_class_access(self, request, class_obj):
        user = request.user
        school = _get_school_from_request(request)

        if user.role == 'superadmin':
            return True

        if school and hasattr(class_obj, 'school_id') and class_obj.school_id and class_obj.school_id != school.id:
            return False

        if user.role in ('admin', 'commandant', 'chief_instructor'):
            return True

        if user.role == 'instructor':
            if class_obj.instructor_id == user.id:
                return True
            return class_obj.subjects.filter(instructor=user, is_active=True).exists()

        return False

class SubjectPerformanceViewSet(_ClassAccessMixin, viewsets.ViewSet):
    permission_classes = [IsAnalyticsViewer]

    @action(detail=False, methods=['get'])
    def summary(self, request):
        subject_id = request.query_params.get('subject_id')
        if not subject_id:
            return Response({'error': 'subject_id parameter is required'}, status=400)

        school = _get_school_from_request(request)
        cache_key = f'subj_perf:{subject_id}:{school.id if school else "all"}'
        cached = cache.get(cache_key)
        if cached:
            return Response(cached)

        try:
            qs = Subject.objects.select_related('instructor', 'class_obj', 'class_obj__course')
            if school:
                qs = qs.filter(school=school)
            subject = qs.get(id=subject_id, is_active=True)
        except Subject.DoesNotExist:
            return Response({'error': 'Subject Not Found'}, status=404)

        class_obj = subject.class_obj

        if not self._has_class_access(request, class_obj):
            return Response(
                {'error': 'You do not have permission to view this subject.'},
                status=403,
            )

        enrollments = Enrollment.objects.filter(
            class_obj=class_obj, is_active=True
        ).select_related('student')
        total_students = enrollments.count()

        results_qs = ExamResult.objects.filter(
            exam__subject=subject, is_submitted=True, marks_obtained__isnull=False,
        )
        att_qs = SessionAttendance.objects.filter(session__subject=subject)

        agg = results_qs.aggregate(
            total_marks=Sum('marks_obtained'),
            total_possible=Sum('exam__total_marks'),
            avg_pct=Avg(PCT_EXPR, output_field=FloatField()),
            max_pct=Max(PCT_EXPR, output_field=FloatField()),
            min_pct=Min(PCT_EXPR, output_field=FloatField()),
            total_count=Count('id'),
            passing=Count('id', filter=Q(marks_obtained__gte=F('exam__total_marks') * 0.5)),
        )
        tc = agg['total_count'] or 0
        pass_rate = ((agg['passing'] or 0) / tc * 100) if tc else 0

        total_sessions = AttendanceSession.objects.filter(
            subject=subject, status__in=['active', 'completed'],
        ).count()
        expected_att = total_students * total_sessions
        actual_att = att_qs.count()
        att_rate_overall = (actual_att / expected_att * 100) if expected_att else 0

        grade_dist = _grade_distribution_sql(results_qs)

        exam_map = _student_exam_map(results_qs)
        att_map_data = _student_att_map(att_qs)

        students = []
        for enr in enrollments:
            sid = enr.student_id
            s = enr.student
            ed = exam_map.get(sid, {})
            ad = att_map_data.get(sid, {})

            st = float(ed.get('total_marks', 0) or 0)
            sp = ed.get('total_possible', 0) or 0
            ep = (st / sp * 100) if sp else 0

            att_cnt = ad.get('attended', 0)
            pres = ad.get('present', 0)
            late = ad.get('late', 0)
            ar = (att_cnt / total_sessions * 100) if total_sessions else 0
            pr = (pres / att_cnt * 100) if att_cnt else 0
            combined = float(ep) * 0.7 + float(ar) * 0.3

            students.append({
                'student_id': s.id,
                'student_name': s.get_full_name(),
                'svc_number': getattr(s, 'svc_number', None),
                'exams_taken': ed.get('exams_taken', 0),
                'exam_percentage': round(ep, 2),
                'total_marks_obtained': st,
                'total_possible_marks': sp,
                'total_sessions': total_sessions,
                'sessions_attached': att_cnt,
                'present_count': pres,
                'late_count': late,
                'absent_count': total_sessions - att_cnt,
                'attendance_rate': round(ar, 2),
                'punctuality_rate': round(pr, 2),
                'combined_score': round(combined, 2),
                'performance_grade': _calculate_grade(combined),
            })

        students.sort(key=lambda x: x['combined_score'], reverse=True)
        for i, st in enumerate(students, 1):
            st['rank'] = i

        exam_bd = list(
            results_qs
            .values('exam_id', 'exam__title', 'exam__exam_type', 'exam__exam_date', 'exam__total_marks')
            .annotate(
                student_attempted=Count('id'),
                avg_pct=Avg(PCT_EXPR, output_field=FloatField()),
                max_pct=Max(PCT_EXPR, output_field=FloatField()),
                min_pct=Min(PCT_EXPR, output_field=FloatField()),
            )
            .order_by('exam__exam_date')
        )
        exam_breakdown = [{
            'exam_id': e['exam_id'],
            'exam_title': e['exam__title'],
            'exam_type': e['exam__exam_type'],
            'exam_date': e['exam__exam_date'],
            'total_marks': e['exam__total_marks'],
            'student_attempted': e['student_attempted'],
            'average_percentage': round(e['avg_pct'] or 0, 2),
            'highest_score': round(e['max_pct'] or 0, 2),
            'lowest_score': round(e['min_pct'] or 0, 2),
        } for e in exam_bd]

        sess_bd = list(
            att_qs
            .values('session_id', 'session__title', 'session__scheduled_start')
            .annotate(
                marked=Count('id'),
                present=Count('id', filter=Q(status='present')),
                late=Count('id', filter=Q(status='late')),
            )
        )
        session_breakdown = [{
            'session_id': s['session_id'],
            'session_title': s['session__title'],
            'session_date': s['session__scheduled_start'],
            'total_students': total_students,
            'marked_count': s['marked'],
            'present': s['present'],
            'late': s['late'],
            'attendance_rate': round((s['marked'] / total_students * 100), 2) if total_students else 0,
        } for s in sess_bd]

        data = {
            'subject': {
                'id': subject.id,
                'name': subject.name,
                'code': getattr(subject, 'subject_code', getattr(subject, 'code', subject.name)),
                'instructor': subject.instructor.get_full_name() if subject.instructor else None,
                'class': class_obj.name,
            },
            'overall_statistics': {
                'total_students_enrolled': total_students,
                'total_exams': Exam.objects.filter(subject=subject, is_active=True).count(),
                'total_results_submitted': tc,
                'exam_average_percentage': round(agg['avg_pct'] or 0, 2),
                'exam_pass_rate': round(pass_rate, 2),
                'highest_exam_score': round(agg['max_pct'] or 0, 2),
                'lowest_exam_score': round(agg['min_pct'] or 0, 2),
                'total_sessions': total_sessions,
                'expected_attendances': expected_att,
                'actual_attendances': actual_att,
                'attendance_rate': round(att_rate_overall, 2),
                'combined_performance': round(float(agg['avg_pct'] or 0) * 0.7 + att_rate_overall * 0.3, 2),
            },
            'grade_distribution': grade_dist,
            'top_performers': students[:10],
            'all_students': students,
            'exam_breakdown': exam_breakdown,
            'session_breakdown': session_breakdown,
        }

        cache.set(cache_key, data, timeout=120)
        return Response(data)

    @action(detail=False, methods=['get'])
    def compare_subjects(self, request):
        class_id = request.query_params.get('class_id')
        if not class_id:
            return Response({'error': 'class_id parameter is required'}, status=400)

        school = _get_school_from_request(request)
        cache_key = f'compare_subj:{class_id}:{school.id if school else "all"}'
        cached = cache.get(cache_key)
        if cached:
            return Response(cached)

        try:
            qs = Class.objects.select_related('course')
            if school:
                qs = qs.filter(school=school)
            class_obj = qs.get(id=class_id, is_active=True)
        except Class.DoesNotExist:
            return Response({'error': 'Class not found'}, status=404)

        if not self._has_class_access(request, class_obj):
            return Response({'error': 'You do not have permission to view this class.'}, status=403)

        subjects = Subject.objects.filter(class_obj=class_obj, is_active=True).select_related('instructor')
        enrolled = Enrollment.objects.filter(class_obj=class_obj, is_active=True).count()

        subj_exam = (
            ExamResult.objects
            .filter(
                exam__subject__class_obj=class_obj,
                is_submitted=True,
                marks_obtained__isnull=False,
            )
            .values('exam__subject_id')
            .annotate(
                tm=Sum('marks_obtained'),
                tp=Sum('exam__total_marks'),
                rc=Count('id'),
                pc=Count('id', filter=Q(marks_obtained__gte=F('exam__total_marks') * 0.5)),
                highest=Max(PCT_EXPR, output_field=FloatField()),
                lowest=Min(PCT_EXPR, output_field=FloatField()),
            )
        )
        sem = {r['exam__subject_id']: r for r in subj_exam}

        subj_att = (
            SessionAttendance.objects
            .filter(session__class_obj=class_obj)
            .values('session__subject_id')
            .annotate(actual=Count('id'))
        )
        sam = {r['session__subject_id']: r['actual'] for r in subj_att}
        ssc = _subject_session_counts(class_obj)

        comparison = []
        for subj in subjects:
            sid = subj.id
            es = sem.get(sid, {})
            tm = float(es.get('tm', 0) or 0)
            tp = es.get('tp', 0) or 0
            rc = es.get('rc', 0)
            pc = es.get('pc', 0)
            avg = (tm / tp * 100) if tp else 0
            pr = (pc / rc * 100) if rc else 0
            sc = ssc.get(sid, 0)
            exp = enrolled * sc
            act = sam.get(sid, 0)
            ar = (act / exp * 100) if exp else 0

            comparison.append({
                'subject_id': sid,
                'subject_name': subj.name,
                'subject_code': getattr(subj, 'subject_code', getattr(subj, 'code', subj.name)),
                'instructor': subj.instructor.get_full_name() if subj.instructor else None,
                'total_exams': Exam.objects.filter(subject=subj, is_active=True).count(),
                'results_count': rc,
                'average_percentage': round(avg, 2),
                'pass_rate': round(pr, 2),
                'highest_score': round(float(es.get('highest') or 0), 2),
                'lowest_score': round(float(es.get('lowest') or 0), 2),
                'attendance_rate': round(ar, 2),
                'combined_performance': round(float(avg) * 0.7 + float(ar) * 0.3, 2),
            })

        comparison.sort(key=lambda x: x['combined_performance'], reverse=True)
        data = {
            'class': {
                'id': class_obj.id,
                'name': class_obj.name,
                'course': class_obj.course.name if hasattr(class_obj, 'course') else None,
            },
            'total_subjects': len(comparison),
            'subjects': comparison,
        }
        cache.set(cache_key, data, timeout=120)
        return Response(data)

    @action(detail=False, methods=['get'])
    def trend_analysis(self, request):
        subject_id = request.query_params.get('subject_id')
        days = int(request.query_params.get('days', 90))
        if not subject_id:
            return Response({'error': 'subject_id parameter is required'}, status=400)

        school = _get_school_from_request(request)
        try:
            qs = Subject.objects.all()
            if school:
                qs = qs.filter(school=school)
            subject = qs.get(id=subject_id, is_active=True)
        except Subject.DoesNotExist:
            return Response({'error': 'Subject not found'}, status=404)

        if not self._has_class_access(request, subject.class_obj):
            return Response({'error': 'You do not have permission to view this subject.'}, status=403)

        cutoff = timezone.now().date() - timedelta(days=days)
        enrolled = Enrollment.objects.filter(class_obj=subject.class_obj, is_active=True).count()

        exam_trend = (
            ExamResult.objects
            .filter(
                exam__subject=subject, exam__is_active=True, exam__exam_date__gte=cutoff,
                is_submitted=True, marks_obtained__isnull=False,
            )
            .values('exam_id', 'exam__title', 'exam__exam_type', 'exam__exam_date')
            .annotate(avg_pct=Avg(PCT_EXPR, output_field=FloatField()), cnt=Count('id'))
            .order_by('exam__exam_date')
        )
        trend = [{
            'date': e['exam__exam_date'],
            'type': 'exam',
            'exam_title': e['exam__title'],
            'exam_type': e['exam__exam_type'],
            'average_percentage': round(e['avg_pct'] or 0, 2),
            'students_attempted': e['cnt'],
        } for e in exam_trend]

        sess_att = (
            SessionAttendance.objects
            .filter(session__subject=subject, session__scheduled_start__gte=cutoff)
            .values('session_id', 'session__title', 'session__scheduled_start')
            .annotate(marked=Count('id'))
        )
        for s in sess_att:
            ar = (s['marked'] / enrolled * 100) if enrolled else 0
            dt = s['session__scheduled_start']
            trend.append({
                'date': dt.date() if hasattr(dt, 'date') else dt,
                'type': 'attendance',
                'session_title': s['session__title'],
                'attendance_rate': round(ar, 2),
                'students_marked': s['marked'],
            })

        trend.sort(key=lambda x: x['date'])
        return Response({
            'subject': {
                'id': subject.id,
                'name': subject.name,
                'code': getattr(subject, 'subject_code', getattr(subject, 'code', subject.name)),
            },
            'period': {
                'start_date': cutoff,
                'end_date': timezone.now().date(),
                'days': days,
            },
            'trend': trend,
        })

class ClassPerformanceViewSet(_ClassAccessMixin, viewsets.ViewSet):
    permission_classes = [IsAnalyticsViewer]

    @action(detail=False, methods=['get'])
    def summary(self, request):
        class_id = request.query_params.get('class_id')
        if not class_id:
            return Response({'error': 'class_id parameter is required'}, status=400)

        school = _get_school_from_request(request)
        cache_key = f'class_perf:{class_id}:{school.id if school else "all"}'
        cached = cache.get(cache_key)
        if cached:
            return Response(cached)

        try:
            qs = Class.objects.select_related('course', 'instructor')
            if school:
                qs = qs.filter(school=school)
            class_obj = qs.get(id=class_id, is_active=True)
        except Class.DoesNotExist:
            return Response({'error': 'Class Not found'}, status=404)

        if not self._has_class_access(request, class_obj):
            return Response(
                {'error': 'You do not have permission to view this class.'},
                status=403,
            )

        enrollments = Enrollment.objects.filter(
            class_obj=class_obj, is_active=True
        ).select_related('student')
        total_students = enrollments.count()
        subjects = list(
            Subject.objects.filter(class_obj=class_obj, is_active=True).select_related('instructor')
        )

        results_qs = ExamResult.objects.filter(
            exam__subject__class_obj=class_obj, is_submitted=True, marks_obtained__isnull=False,
        )
        att_qs = SessionAttendance.objects.filter(session__class_obj=class_obj)

        ov = results_qs.aggregate(
            tm=Sum('marks_obtained'),
            tp=Sum('exam__total_marks'),
            tc=Count('id'),
            pc=Count('id', filter=Q(marks_obtained__gte=F('exam__total_marks') * 0.5)),
        )
        _tm = float(ov['tm'] or 0)
        _tp = ov['tp'] or 0
        _tc = ov['tc'] or 0
        _pc = ov['pc'] or 0
        class_avg = (_tm / _tp * 100) if _tp else 0
        pass_rate = (_pc / _tc * 100) if _tc else 0


        total_sessions = AttendanceSession.objects.filter(class_obj=class_obj).count()
        expected_att = total_students * total_sessions
        actual_att = att_qs.count()
        class_att_rate = (actual_att / expected_att * 100) if expected_att else 0


        grade_dist = _grade_distribution_sql(results_qs)

        exam_map = _student_exam_map(results_qs)
        att_map_data = _student_att_map(att_qs)
        subj_exam_data = _student_subject_exam_map(results_qs)
        subj_att_data = _student_subject_att_map(att_qs)
        ssc = _subject_session_counts(class_obj)

        rankings = []
        for enr in enrollments:
            sid = enr.student_id
            s = enr.student
            ed = exam_map.get(sid, {})
            ad = att_map_data.get(sid, {})

            st = float(ed.get('total_marks', 0) or 0)
            sp = ed.get('total_possible', 0) or 0
            ep = (st / sp * 100) if sp else 0
            attended = ad.get('attended', 0)
            pres = ad.get('present', 0)
            late = ad.get('late', 0)
            ar = (attended / total_sessions * 100) if total_sessions else 0
            combined = float(ep) * 0.7 + float(ar) * 0.3

            sse = subj_exam_data.get(sid, {})
            ssa = subj_att_data.get(sid, {})
            sb = []
            for subj in subjects:
                se = sse.get(subj.id, {})
                sa = ssa.get(subj.id, {})
                stm = float(se.get('total_marks', 0) or 0)
                stp = se.get('total_possible', 0) or 0
                spct = (stm / stp * 100) if stp else 0
                ssess = ssc.get(subj.id, 0)
                satt = sa.get('attended', 0)
                sar = (satt / ssess * 100) if ssess else 0
                if stm > 0 or satt > 0:
                    sb.append({
                        'subject_name': subj.name,
                        'subject_code': getattr(subj, 'subject_code', getattr(subj, 'code', subj.name)),
                        'marks_obtained': stm,
                        'total_possible': float(stp),
                        'exam_percentage': round(spct, 2),
                        'attendance_rate': round(sar, 2),
                        'combined_score': round(float(spct) * 0.7 + float(sar) * 0.3, 2),
                    })

            rankings.append({
                'student_id': s.id,
                'student_name': s.get_full_name(),
                'svc_number': getattr(s, 'svc_number', None),
                'total_exams_taken': ed.get('exams_taken', 0),
                'total_marks_obtained': st,
                'total_marks_possible': float(sp),
                'exam_percentage': round(ep, 2),
                'total_sessions': total_sessions,
                'sessions_attended': attended,
                'attendance_rate': round(ar, 2),
                'combined_score': round(combined, 2),
                'overall_grade': _calculate_grade(ep),
                'subject_breakdown': sb,
            })

        rankings.sort(key=lambda x: x['combined_score'], reverse=True)
        for i, r in enumerate(rankings, 1):
            r['rank'] = i

        subj_exam_agg = results_qs.values('exam__subject_id').annotate(
            tm=Sum('marks_obtained'),
            tp=Sum('exam__total_marks'),
            rc=Count('id'),
            pc=Count('id', filter=Q(marks_obtained__gte=F('exam__total_marks') * 0.5)),
            highest=Max(PCT_EXPR, output_field=FloatField()),
            lowest=Min(PCT_EXPR, output_field=FloatField()),
        )
        sea_map = {r['exam__subject_id']: r for r in subj_exam_agg}

        subj_att_agg = att_qs.values('session__subject_id').annotate(actual=Count('id'))
        saa_map = {r['session__subject_id']: r['actual'] for r in subj_att_agg}

        subject_perf = []
        for subj in subjects:
            es = sea_map.get(subj.id, {})
            stm = float(es.get('tm', 0) or 0)
            stp = es.get('tp', 0) or 0
            src = es.get('rc', 0)
            spc = es.get('pc', 0)
            savg = (stm / stp * 100) if stp else 0
            spr = (spc / src * 100) if src else 0
            sc = ssc.get(subj.id, 0)
            sexp = total_students * sc
            sact = saa_map.get(subj.id, 0)
            sar = (sact / sexp * 100) if sexp else 0

            subject_perf.append({
                'subject_id': subj.id,
                'subject_name': subj.name,
                'subject_code': getattr(subj, 'subject_code', getattr(subj, 'code', subj.name)),
                'instructor': subj.instructor.get_full_name() if subj.instructor else None,
                'total_exams': Exam.objects.filter(subject=subj, is_active=True).count(),
                'results_count': src,
                'exam_average': round(savg, 2),
                'pass_rate': round(spr, 2),
                'highest_score': round(float(es.get('highest') or 0), 2),
                'lowest_score': round(float(es.get('lowest') or 0), 2),
                'total_sessions': sc,
                'attendance_rate': round(sar, 2),
                'combined_performance': round(float(savg) * 0.7 + float(sar) * 0.3, 2),
            })
        subject_perf.sort(key=lambda x: x['combined_performance'], reverse=True)

        data = {
            'class': {
                'id': class_obj.id,
                'name': class_obj.name,
                'course': class_obj.course.name if hasattr(class_obj, 'course') and class_obj.course else None,
                'instructor': class_obj.instructor.get_full_name() if hasattr(class_obj, 'instructor') and class_obj.instructor else None,
            },
            'overall_statistics': {
                'total_students': total_students,
                'total_subjects': len(subjects),
                'total_exams': Exam.objects.filter(subject__class_obj=class_obj, is_active=True).count(),
                'total_results_submitted': _tc,
                'class_exam_average': round(class_avg, 2),
                'exam_pass_rate': round(pass_rate, 2),
                'total_sessions': total_sessions,
                'expected_attendances': expected_att,
                'actual_attendances': actual_att,
                'class_attendance_rate': round(class_att_rate, 2),
                'overall_performance': round(float(class_avg) * 0.7 + float(class_att_rate) * 0.3, 2),
            },
            'grade_distribution': grade_dist,

            'top_performers': rankings[:3],
            'all_students': rankings,
            'subject_performance': subject_perf,
        }

        cache.set(cache_key, data, timeout=120)
        return Response(data)

    @action(detail=False, methods=['get'])
    def top_performers(self, request):
        class_id = request.query_params.get('class_id')
        limit = int(request.query_params.get('limit', 10))
        if not class_id:
            return Response({'error': 'class_id parameter is required'}, status=400)

        school = _get_school_from_request(request)
        try:
            qs = Class.objects.select_related('instructor')
            if school:
                qs = qs.filter(school=school)
            class_obj = qs.get(id=class_id, is_active=True)
        except Class.DoesNotExist:
            return Response({'error': 'Class not found'}, status=404)

        if not self._has_class_access(request, class_obj):
            return Response({'error': 'You do not have permission to view this class.'}, status=403)

        enrollments = Enrollment.objects.filter(
            class_obj=class_obj, is_active=True,
        ).select_related('student')
        results_qs = ExamResult.objects.filter(
            exam__subject__class_obj=class_obj, is_submitted=True, marks_obtained__isnull=False,
        )
        att_qs = SessionAttendance.objects.filter(session__class_obj=class_obj)
        total_sessions = AttendanceSession.objects.filter(class_obj=class_obj).count()

        exam_map = _student_exam_map(results_qs)
        att_map_data = _student_att_map(att_qs)

        performers = []
        for enr in enrollments:
            sid = enr.student_id
            s = enr.student
            ed = exam_map.get(sid, {})
            ad = att_map_data.get(sid, {})
            st = float(ed.get('total_marks', 0) or 0)
            sp = ed.get('total_possible', 0) or 0
            ep = (st / sp * 100) if sp else 0
            attended = ad.get('attended', 0)
            ar = (attended / total_sessions * 100) if total_sessions else 0
            combined = float(ep) * 0.7 + float(ar) * 0.3

            performers.append({
                'student_id': s.id,
                'student_name': s.get_full_name(),
                'svc_number': getattr(s, 'svc_number', None),
                'exam_percentage': round(ep, 2),
                'attendance_rate': round(ar, 2),
                'combined_score': round(combined, 2),
                'overall_grade': _calculate_grade(ep),
            })

        performers.sort(key=lambda x: x['combined_score'], reverse=True)
        for i, p in enumerate(performers, 1):
            p['rank'] = i

        return Response({
            'class': {'id': class_obj.id, 'name': class_obj.name},
            'limit': limit,
            'top_performers': performers[:limit],
        })

    @action(detail=False, methods=['get'])
    def compare_classes(self, request):

        if request.user.role not in ('admin', 'superadmin', 'commandant'):
            return Response(
                {'error': 'You do not have permission to compare classes.'},
                status=403,
            )

        school = _get_school_from_request(request)

        course_id = request.query_params.get('course_id')
        class_ids = request.query_params.get('class_ids', '')

        if course_id:
            qs = Class.objects.filter(course_id=course_id, is_active=True)
        elif class_ids:
            ids = [i.strip() for i in class_ids.split(',') if i.strip()]
            qs = Class.objects.filter(id__in=ids, is_active=True)
        else:
            qs = Class.objects.filter(is_active=True)

        if school:
            qs = qs.filter(school=school)
        classes = qs.select_related('course', 'instructor')

        comparison = []
        for cls in classes:
            enrolled = Enrollment.objects.filter(class_obj=cls, is_active=True).count()
            results_qs = ExamResult.objects.filter(
                exam__subject__class_obj=cls, is_submitted=True, marks_obtained__isnull=False,
            )
            ov = results_qs.aggregate(
                tm=Sum('marks_obtained'),
                tp=Sum('exam__total_marks'),
                tc=Count('id'),
                pc=Count('id', filter=Q(marks_obtained__gte=F('exam__total_marks') * 0.5)),
            )
            _tm = float(ov['tm'] or 0)
            _tp = ov['tp'] or 0
            _tc = ov['tc'] or 0
            _pc = ov['pc'] or 0
            avg = (_tm / _tp * 100) if _tp else 0
            pr = (_pc / _tc * 100) if _tc else 0

            ts = AttendanceSession.objects.filter(class_obj=cls).count()
            exp = enrolled * ts
            act = SessionAttendance.objects.filter(session__class_obj=cls).count()
            ar = (act / exp * 100) if exp else 0

            comparison.append({
                'class_id': cls.id,
                'class_name': cls.name,
                'course': cls.course.name if hasattr(cls, 'course') and cls.course else None,
                'instructor': cls.instructor.get_full_name() if hasattr(cls, 'instructor') and cls.instructor else None,
                'total_students': enrolled,
                'total_results': _tc,
                'average_percentage': round(avg, 2),
                'pass_rate': round(pr, 2),
                'attendance_rate': round(ar, 2),
                'combined_performance': round(float(avg) * 0.7 + float(ar) * 0.3, 2),
            })

        comparison.sort(key=lambda x: x.get('average_percentage', 0), reverse=True)
        return Response({
            'total_classes': len(comparison),
            'classes': comparison,
        })

    @action(detail=False, methods=['get'])
    def export_report(self, request):
        class_id = request.query_params.get('class_id')
        report_format = request.query_params.get('format', 'summary')

        if not class_id:
            return Response({'error': 'class_id parameter is required'}, status=400)

        school = _get_school_from_request(request)
        try:
            qs = Class.objects.select_related('instructor')
            if school:
                qs = qs.filter(school=school)
            class_obj = qs.get(id=class_id, is_active=True)
        except Class.DoesNotExist:
            return Response({'error': 'Class Not found'}, status=404)

        if not self._has_class_access(request, class_obj):
            return Response({'error': 'You do not have permission to view this class.'}, status=403)

        summary_response = self.summary(request)

        if report_format == 'detailed':
            return Response({
                **summary_response.data,
                'report_generated_at': timezone.now(),
                'report_type': 'detailed',
            })
        else:
            return Response({
                'class': summary_response.data.get('class'),
                'overall_statistics': summary_response.data.get('overall_statistics'),
                'grade_distribution': summary_response.data.get('grade_distribution'),
                'top_performers': summary_response.data.get('top_performers'),
                'subject_performance': summary_response.data.get('subject_performance'),
                'report_generated_at': timezone.now(),
                'report_type': 'summary',
            })

    @action(detail=False, methods=['get'])
    def trend_analysis(self, request):
        class_id = request.query_params.get('class_id')
        days = int(request.query_params.get('days', 90))
        if not class_id:
            return Response({'error': 'class_id parameter is required'}, status=400)

        school = _get_school_from_request(request)
        try:
            qs = Class.objects.select_related('course', 'instructor')
            if school:
                qs = qs.filter(school=school)
            class_obj = qs.get(id=class_id, is_active=True)
        except Class.DoesNotExist:
            return Response({'error': 'Class not found'}, status=404)

        if not self._has_class_access(request, class_obj):
            return Response({'error': 'You do not have permission to view this class.'}, status=403)

        cutoff = timezone.now().date() - timedelta(days=days)
        enrolled = Enrollment.objects.filter(class_obj=class_obj, is_active=True).count()

        exam_trend = (
            ExamResult.objects
            .filter(
                exam__subject__class_obj=class_obj, exam__is_active=True,
                exam__exam_date__gte=cutoff, is_submitted=True, marks_obtained__isnull=False,
            )
            .values('exam_id', 'exam__title', 'exam__exam_type', 'exam__exam_date', 'exam__subject__name')
            .annotate(avg_pct=Avg(PCT_EXPR, output_field=FloatField()), cnt=Count('id'))
            .order_by('exam__exam_date')
        )
        trend = [{
            'date': e['exam__exam_date'],
            'type': 'exam',
            'exam_title': e['exam__title'],
            'subject': e['exam__subject__name'],
            'exam_type': e['exam__exam_type'],
            'average_percentage': round(e['avg_pct'] or 0, 2),
            'students_attempted': e['cnt'],
            'participation_rate': round((e['cnt'] / enrolled * 100), 2) if enrolled else 0,
        } for e in exam_trend]

        sess_att = (
            SessionAttendance.objects
            .filter(session__class_obj=class_obj, session__scheduled_start__gte=cutoff)
            .values('session_id', 'session__title', 'session__scheduled_start', 'session__subject__name')
            .annotate(
                marked=Count('id'),
                present=Count('id', filter=Q(status='present')),
                late=Count('id', filter=Q(status='late')),
            )
        )
        for s in sess_att:
            ar = (s['marked'] / enrolled * 100) if enrolled else 0
            dt = s['session__scheduled_start']
            trend.append({
                'date': dt.date() if hasattr(dt, 'date') else dt,
                'type': 'attendance',
                'session_title': s['session__title'],
                'subject': s['session__subject__name'],
                'attendance_rate': round(ar, 2),
                'students_marked': s['marked'],
                'present_count': s['present'],
                'late_count': s['late'],
            })

        trend.sort(key=lambda x: x['date'])

        exam_data = [d for d in trend if d['type'] == 'exam']
        att_data = [d for d in trend if d['type'] == 'attendance']
        avg_exam = (sum(d['average_percentage'] for d in exam_data) / len(exam_data)) if exam_data else 0
        avg_att = (sum(d['attendance_rate'] for d in att_data) / len(att_data)) if att_data else 0

        return Response({
            'class': {
                'id': class_obj.id,
                'name': class_obj.name,
                'course': class_obj.course.name if hasattr(class_obj, 'course') else None,
            },
            'period': {
                'start_date': cutoff,
                'end_date': timezone.now().date(),
                'days': days,
            },
            'summary': {
                'total_data_points': len(trend),
                'total_exams': len(exam_data),
                'total_sessions': len(att_data),
                'average_exam_performance': round(avg_exam, 2),
                'average_attendance_rate': round(avg_att, 2),
                'total_enrolled_students': enrolled,
            },
            'trend': trend,
        })

    @action(detail=False, methods=['get'])
    def attendance_correlation(self, request):
        class_id = request.query_params.get('class_id')
        if not class_id:
            return Response({'error': 'class_id parameter is required'}, status=400)

        school = _get_school_from_request(request)
        try:
            qs = Class.objects.select_related('course', 'instructor')
            if school:
                qs = qs.filter(school=school)
            class_obj = qs.get(id=class_id, is_active=True)
        except Class.DoesNotExist:
            return Response({'error': 'Class not found'}, status=404)

        if not self._has_class_access(request, class_obj):
            return Response({'error': 'You do not have permission to view this class.'}, status=403)

        enrollments = Enrollment.objects.filter(
            class_obj=class_obj, is_active=True,
        ).select_related('student')
        results_qs = ExamResult.objects.filter(
            exam__subject__class_obj=class_obj, is_submitted=True, marks_obtained__isnull=False,
        )
        att_qs = SessionAttendance.objects.filter(session__class_obj=class_obj)
        total_sessions = AttendanceSession.objects.filter(class_obj=class_obj).count()

        if total_sessions == 0:
            return Response({'message': 'No attendance sessions found for this class'})

        exam_map = _student_exam_map(results_qs)
        att_map_data = _student_att_map(att_qs)

        correlation_data = []
        for enr in enrollments:
            sid = enr.student_id
            ed = exam_map.get(sid, {})
            ad = att_map_data.get(sid, {})
            st = float(ed.get('total_marks', 0) or 0)
            sp = ed.get('total_possible', 0) or 0
            ep = (st / sp * 100) if sp else 0
            attended = ad.get('attended', 0)
            ar = (attended / total_sessions * 100) if total_sessions else 0

            correlation_data.append({
                'student_id': enr.student.id,
                'student_name': enr.student.get_full_name(),
                'svc_number': getattr(enr.student, 'svc_number', None),
                'attendance_rate': round(ar, 2),
                'exam_percentage': round(ep, 2),
            })

        correlation_data.sort(key=lambda x: x['attendance_rate'], reverse=True)

        n = len(correlation_data)
        correlation = 0
        if n >= 2:
            x_vals = [d['attendance_rate'] for d in correlation_data]
            y_vals = [d['exam_percentage'] for d in correlation_data]

            sum_x = sum(x_vals)
            sum_y = sum(y_vals)
            sum_xy = sum(a * e for a, e in zip(x_vals, y_vals))
            sum_x2 = sum(a ** 2 for a in x_vals)
            sum_y2 = sum(e ** 2 for e in y_vals)

            numerator = (n * sum_xy) - (sum_x * sum_y)
            denom_a = (n * sum_x2) - (sum_x ** 2)
            denom_b = (n * sum_y2) - (sum_y ** 2)
            denominator = (denom_a * denom_b) ** 0.5

            correlation = round(numerator / denominator, 4) if denominator != 0 else 0

        return Response({
            'class': {
                'id': class_obj.id,
                'name': class_obj.name,
                'course': class_obj.course.name if hasattr(class_obj, 'course') else None,
            },
            'correlation_coefficient': correlation,
            'interpretation': _interpret_correlation(correlation),
            'data_points': n,
            'total_sessions': total_sessions,
            'correlation_data': correlation_data,
        })