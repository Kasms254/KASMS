from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
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
        total_marks=Sum('marks_obtained'), total_possible=Sum('exam__total_marks'),
        exams_taken=Count('id'),
        passing_count=Count('id', filter=Q(marks_obtained__gte=F('exam__total_marks') * 0.5)),
    )
    return {r['student_id']: r for r in rows}


def _student_subject_exam_map(result_qs):
    rows = result_qs.values('student_id', 'exam__subject_id').annotate(
        total_marks=Sum('marks_obtained'), total_possible=Sum('exam__total_marks'),
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
    rows = AttendanceSession.objects.filter(class_obj=class_obj).values('subject_id').annotate(cnt=Count('id'))
    return {r['subject_id']: r['cnt'] for r in rows}

class SubjectPerformanceViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsAdminOrInstructor]

    @action(detail=False, methods=['get'])
    def summary(self, request):
        subject_id = request.query_params.get('subject_id')
        if not subject_id:
            return Response({'error': 'subject_id parameter is required'}, status=400)

        cache_key = f'subj_perf:{subject_id}'
        cached = cache.get(cache_key)
        if cached:
            return Response(cached)

        try:
            subject = Subject.objects.select_related(
                'instructor', 'class_obj', 'class_obj__course'
            ).get(id=subject_id, is_active=True)
        except Subject.DoesNotExist:
            return Response({'error': 'Subject Not Found'}, status=404)

        class_obj = subject.class_obj
        enrollments = Enrollment.objects.filter(class_obj=class_obj, is_active=True).select_related('student')
        total_students = enrollments.count()

        results_qs = ExamResult.objects.filter(
            exam__subject=subject, is_submitted=True, marks_obtained__isnull=False
        )
        att_qs = SessionAttendance.objects.filter(session__subject=subject)

        agg = results_qs.aggregate(
            total_marks=Sum('marks_obtained'), total_possible=Sum('exam__total_marks'),
            avg_pct=Avg(PCT_EXPR, output_field=FloatField()),
            max_pct=Max(PCT_EXPR, output_field=FloatField()),
            min_pct=Min(PCT_EXPR, output_field=FloatField()),
            total_count=Count('id'),
            passing=Count('id', filter=Q(marks_obtained__gte=F('exam__total_marks') * 0.5)),
        )
        tc = agg['total_count'] or 0
        pass_rate = ((agg['passing'] or 0) / tc * 100) if tc else 0

        total_sessions = AttendanceSession.objects.filter(
            subject=subject, status__in=['active', 'completed']
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
                'student_id': s.id, 'student_name': s.get_full_name(),
                'svc_number': getattr(s, 'svc_number', None),
                'exams_taken': ed.get('exams_taken', 0),
                'exam_percentage': round(ep, 2),
                'total_marks_obtained': st, 'total_possible_marks': sp,
                'total_sessions': total_sessions, 'sessions_attached': att_cnt,
                'present_count': pres, 'late_count': late,
                'absent_count': total_sessions - att_cnt,
                'attendance_rate': round(ar, 2), 'punctuality_rate': round(pr, 2),
                'combined_score': round(combined, 2),
                'performance_grade': _calculate_grade(combined),
            })

        students.sort(key=lambda x: x['combined_score'], reverse=True)
        for i, st in enumerate(students, 1):
            st['rank'] = i

        exam_bd = list(
            results_qs.values('exam_id', 'exam__title', 'exam__exam_type', 'exam__exam_date', 'exam__total_marks')
            .annotate(
                student_attempted=Count('id'),
                avg_pct=Avg(PCT_EXPR, output_field=FloatField()),
                max_pct=Max(PCT_EXPR, output_field=FloatField()),
                min_pct=Min(PCT_EXPR, output_field=FloatField()),
            ).order_by('exam__exam_date')
        )
        exam_breakdown = [{
            'exam_id': e['exam_id'], 'exam_title': e['exam__title'],
            'exam_type': e['exam__exam_type'], 'exam_date': e['exam__exam_date'],
            'total_marks': e['exam__total_marks'], 'student_attempted': e['student_attempted'],
            'average_percentage': round(e['avg_pct'] or 0, 2),
            'highest_score': round(e['max_pct'] or 0, 2),
            'lowest_score': round(e['min_pct'] or 0, 2),
        } for e in exam_bd]

        sess_bd = list(
            att_qs.values('session_id', 'session__title', 'session__scheduled_start')
            .annotate(
                marked=Count('id'),
                present=Count('id', filter=Q(status='present')),
                late=Count('id', filter=Q(status='late')),
            )
        )
        session_breakdown = [{
            'session_id': s['session_id'], 'session_title': s['session__title'],
            'session_date': s['session__scheduled_start'],
            'total_students': total_students, 'marked_count': s['marked'],
            'present': s['present'], 'late': s['late'],
            'attendance_rate': round((s['marked'] / total_students * 100), 2) if total_students else 0,
        } for s in sess_bd]

        data = {
            'subject': {
                'id': subject.id, 'name': subject.name,
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

        cache_key = f'compare_subj:{class_id}'
        cached = cache.get(cache_key)
        if cached:
            return Response(cached)

        try:
            class_obj = Class.objects.get(id=class_id, is_active=True)
        except Class.DoesNotExist:
            return Response({'error': 'Class not found'}, status=404)

        subjects = Subject.objects.filter(class_obj=class_obj, is_active=True).select_related('instructor')
        enrolled = Enrollment.objects.filter(class_obj=class_obj, is_active=True).count()

        subj_exam = (
            ExamResult.objects
            .filter(exam__subject__class_obj=class_obj, is_submitted=True, marks_obtained__isnull=False)
            .values('exam__subject_id')
            .annotate(tm=Sum('marks_obtained'), tp=Sum('exam__total_marks'),
                      rc=Count('id'),
                      pc=Count('id', filter=Q(marks_obtained__gte=F('exam__total_marks') * 0.5)))
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
                'subject_id': sid, 'subject_name': subj.name,
                'subject_code': getattr(subj, 'subject_code', getattr(subj, 'code', subj.name)),
                'instructor': subj.instructor.get_full_name() if subj.instructor else None,
                'total_exams': Exam.objects.filter(subject=subj, is_active=True).count(),
                'results_count': rc, 'average_percentage': round(avg, 2),
                'pass_rate': round(pr, 2), 'highest_score': 0, 'lowest_score': 0,
                'attendance_rate': round(ar, 2),
                'combined_performance': round(float(avg) * 0.7 + float(ar) * 0.3, 2),
            })

        comparison.sort(key=lambda x: x['combined_performance'], reverse=True)
        data = {
            'class': {'id': class_obj.id, 'name': class_obj.name,
                      'course': class_obj.course.name if hasattr(class_obj, 'course') else None},
            'total_subjects': len(comparison), 'subjects': comparison,
        }
        cache.set(cache_key, data, timeout=120)
        return Response(data)

    @action(detail=False, methods=['get'])
    def trend_analysis(self, request):
        subject_id = request.query_params.get('subject_id')
        days = int(request.query_params.get('days', 90))
        if not subject_id:
            return Response({'error': 'subject_id parameter is required'}, status=400)
        try:
            subject = Subject.objects.get(id=subject_id, is_active=True)
        except Subject.DoesNotExist:
            return Response({'error': 'Subject not found'}, status=404)

        cutoff = timezone.now().date() - timedelta(days=days)
        enrolled = Enrollment.objects.filter(class_obj=subject.class_obj, is_active=True).count()

        exam_trend = (
            ExamResult.objects
            .filter(exam__subject=subject, exam__is_active=True, exam__exam_date__gte=cutoff,
                    is_submitted=True, marks_obtained__isnull=False)
            .values('exam_id', 'exam__title', 'exam__exam_type', 'exam__exam_date')
            .annotate(avg_pct=Avg(PCT_EXPR, output_field=FloatField()), cnt=Count('id'))
            .order_by('exam__exam_date')
        )
        trend = [{'date': e['exam__exam_date'], 'type': 'exam', 'exam_title': e['exam__title'],
                  'exam_type': e['exam__exam_type'], 'average_percentage': round(e['avg_pct'] or 0, 2),
                  'students_attempted': e['cnt']} for e in exam_trend]

        sess_att = (
            SessionAttendance.objects
            .filter(session__subject=subject, session__scheduled_start__gte=cutoff)
            .values('session_id', 'session__title', 'session__scheduled_start')
            .annotate(marked=Count('id'))
        )
        for s in sess_att:
            ar = (s['marked'] / enrolled * 100) if enrolled else 0
            dt = s['session__scheduled_start']
            trend.append({'date': dt.date() if hasattr(dt, 'date') else dt, 'type': 'attendance',
                          'session_title': s['session__title'], 'attendance_rate': round(ar, 2),
                          'students_marked': s['marked']})

        trend.sort(key=lambda x: x['date'])
        return Response({
            'subject': {'id': subject.id, 'name': subject.name,
                        'code': getattr(subject, 'subject_code', getattr(subject, 'code', subject.name))},
            'period': {'start_date': cutoff, 'end_date': timezone.now().date(), 'days': days},
            'trend': trend,
        })

class ClassPerformanceViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def _has_class_access(self, request, class_obj):
        user = request.user
        if user.role in ['admin', 'superadmin', 'commandant']:
            return True
        return user.role == 'instructor' and class_obj.instructor_id == user.id

    @action(detail=False, methods=['get'])
    def summary(self, request):
        class_id = request.query_params.get('class_id')
        if not class_id:
            return Response({'error': 'class_id parameter is required'}, status=400)

        cache_key = f'class_perf:{class_id}'
        cached = cache.get(cache_key)
        if cached:
            return Response(cached)

        try:
            class_obj = Class.objects.select_related('course', 'instructor').get(id=class_id, is_active=True)
        except Class.DoesNotExist:
            return Response({'error': 'Class Not found'}, status=404)

        if not self._has_class_access(request, class_obj):
            return Response({'error': 'You do not have permission to view this class.'}, status=403)

        enrollments = Enrollment.objects.filter(class_obj=class_obj, is_active=True).select_related('student')
        total_students = enrollments.count()
        subjects = list(Subject.objects.filter(class_obj=class_obj, is_active=True).select_related('instructor'))

        results_qs = ExamResult.objects.filter(
            exam__subject__class_obj=class_obj, is_submitted=True, marks_obtained__isnull=False
        )
        att_qs = SessionAttendance.objects.filter(session__class_obj=class_obj)

        ov = results_qs.aggregate(
            tm=Sum('marks_obtained'), tp=Sum('exam__total_marks'),
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
                        'marks_obtained': stm, 'total_possible': float(stp),
                        'exam_percentage': round(spct, 2), 'attendance_rate': round(sar, 2),
                        'combined_score': round(float(spct) * 0.7 + float(sar) * 0.3, 2),
                    })

            rankings.append({
                'student_id': s.id, 'student_name': s.get_full_name(),
                'svc_number': getattr(s, 'svc_number', None),
                'total_exams_taken': ed.get('exams_taken', 0),
                'total_marks_obtained': st, 'total_marks_possible': float(sp),
                'exam_percentage': round(ep, 2),
                'total_sessions': total_sessions, 'sessions_attended': attended,
                'attendance_rate': round(ar, 2), 'combined_score': round(combined, 2),
                'overall_grade': _calculate_grade(ep), 'subject_breakdown': sb,
            })

        rankings.sort(key=lambda x: x['combined_score'], reverse=True)
        for i, r in enumerate(rankings, 1):
            r['rank'] = i

        subj_exam_agg = results_qs.values('exam__subject_id').annotate(
            tm=Sum('marks_obtained'), tp=Sum('exam__total_marks'), rc=Count('id'),
            pc=Count('id', filter=Q(marks_obtained__gte=F('exam__total_marks') * 0.5)),
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
                'subject_id': subj.id, 'subject_name': subj.name,
                'subject_code': getattr(subj, 'subject_code', getattr(subj, 'code', subj.name)),
                'instructor': subj.instructor.get_full_name() if subj.instructor else None,
                'total_exams': Exam.objects.filter(subject=subj, is_active=True).count(),
                'results_count': src, 'exam_average': round(savg, 2), 'pass_rate': round(spr, 2),
                'total_sessions': sc, 'attendance_rate': round(sar, 2),
                'combined_performance': round(float(savg) * 0.7 + float(sar) * 0.3, 2),
            })
        subject_perf.sort(key=lambda x: x['combined_performance'], reverse=True)

        data = {
            'class': {
                'id': class_obj.id, 'name': class_obj.name,
                'course': class_obj.course.name if hasattr(class_obj, 'course') and class_obj.course else None,
                'instructor': class_obj.instructor.get_full_name() if hasattr(class_obj, 'instructor') and class_obj.instructor else None,
            },
            'overall_statistics': {
                'total_students': total_students, 'total_subjects': len(subjects),
                'class_average': round(class_avg, 2), 'pass_rate': round(pass_rate, 2),
                'total_sessions': total_sessions, 'attendance_rate': round(class_att_rate, 2),
                'combined_performance': round(float(class_avg) * 0.7 + float(class_att_rate) * 0.3, 2),
            },
            'grade_distribution': grade_dist,
            'student_rankings': rankings,
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
        try:
            class_obj = Class.objects.get(id=class_id, is_active=True)
        except Class.DoesNotExist:
            return Response({'error': 'Class not found'}, status=404)

        enrollments = Enrollment.objects.filter(class_obj=class_obj, is_active=True).select_related('student')
        results_qs = ExamResult.objects.filter(
            exam__subject__class_obj=class_obj, is_submitted=True, marks_obtained__isnull=False
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
                'student_id': s.id, 'student_name': s.get_full_name(),
                'svc_number': getattr(s, 'svc_number', None),
                'exam_percentage': round(ep, 2), 'attendance_rate': round(ar, 2),
                'combined_score': round(combined, 2), 'overall_grade': _calculate_grade(ep),
            })

        performers.sort(key=lambda x: x['combined_score'], reverse=True)
        for i, p in enumerate(performers, 1):
            p['rank'] = i

        return Response({'class': class_obj.name, 'top_performers': performers[:limit]})

    @action(detail=False, methods=['get'])
    def compare_classes(self, request):
        class_ids = request.query_params.get('class_ids', '')
        if not class_ids:
            return Response({'error': 'class_ids parameter is required (comma-separated)'}, status=400)

        ids = [i.strip() for i in class_ids.split(',') if i.strip()]
        classes = Class.objects.filter(id__in=ids, is_active=True).select_related('course', 'instructor')

        comparison = []
        for cls in classes:
            enrolled = Enrollment.objects.filter(class_obj=cls, is_active=True).count()
            results_qs = ExamResult.objects.filter(
                exam__subject__class_obj=cls, is_submitted=True, marks_obtained__isnull=False
            )
            ov = results_qs.aggregate(
                tm=Sum('marks_obtained'), tp=Sum('exam__total_marks'),
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
                'class_id': cls.id, 'class_name': cls.name,
                'course': cls.course.name if hasattr(cls, 'course') and cls.course else None,
                'instructor': cls.instructor.get_full_name() if hasattr(cls, 'instructor') and cls.instructor else None,
                'total_students': enrolled,
                'total_subjects': Subject.objects.filter(class_obj=cls, is_active=True).count(),
                'class_average': round(avg, 2), 'pass_rate': round(pr, 2),
                'attendance_rate': round(ar, 2),
                'combined_performance': round(float(avg) * 0.7 + float(ar) * 0.3, 2),
            })

        comparison.sort(key=lambda x: x['combined_performance'], reverse=True)
        return Response({'comparison': comparison})

    @action(detail=False, methods=['get'])
    def trend_analysis(self, request):
        class_id = request.query_params.get('class_id')
        days = int(request.query_params.get('days', 90))
        if not class_id:
            return Response({'error': 'class_id parameter is required'}, status=400)
        try:
            class_obj = Class.objects.get(id=class_id, is_active=True)
        except Class.DoesNotExist:
            return Response({'error': 'Class not found'}, status=404)

        cutoff = timezone.now().date() - timedelta(days=days)
        enrolled = Enrollment.objects.filter(class_obj=class_obj, is_active=True).count()

        exam_trend = (
            ExamResult.objects
            .filter(exam__subject__class_obj=class_obj, exam__is_active=True,
                    exam__exam_date__gte=cutoff, is_submitted=True, marks_obtained__isnull=False)
            .values('exam_id', 'exam__title', 'exam__exam_type', 'exam__exam_date', 'exam__subject__name')
            .annotate(avg_pct=Avg(PCT_EXPR, output_field=FloatField()), cnt=Count('id'))
            .order_by('exam__exam_date')
        )
        trend = [{'date': e['exam__exam_date'], 'type': 'exam', 'exam_title': e['exam__title'],
                  'subject': e['exam__subject__name'], 'exam_type': e['exam__exam_type'],
                  'average_percentage': round(e['avg_pct'] or 0, 2),
                  'students_attempted': e['cnt']} for e in exam_trend]

        sess_att = (
            SessionAttendance.objects
            .filter(session__class_obj=class_obj, session__scheduled_start__gte=cutoff)
            .values('session_id', 'session__title', 'session__scheduled_start', 'session__subject__name')
            .annotate(marked=Count('id'))
        )
        for s in sess_att:
            ar = (s['marked'] / enrolled * 100) if enrolled else 0
            dt = s['session__scheduled_start']
            trend.append({'date': dt.date() if hasattr(dt, 'date') else dt, 'type': 'attendance',
                          'session_title': s['session__title'], 'subject': s['session__subject__name'],
                          'attendance_rate': round(ar, 2), 'students_marked': s['marked']})

        trend.sort(key=lambda x: x['date'])
        return Response({
            'class': {'id': class_obj.id, 'name': class_obj.name},
            'period': {'start_date': cutoff, 'end_date': timezone.now().date(), 'days': days},
            'trend': trend,
        })

    @action(detail=False, methods=['get'])
    def attendance_correlation(self, request):
        class_id = request.query_params.get('class_id')
        if not class_id:
            return Response({'error': 'class_id parameter is required'}, status=400)
        try:
            class_obj = Class.objects.get(id=class_id, is_active=True)
        except Class.DoesNotExist:
            return Response({'error': 'Class not found'}, status=404)

        enrollments = Enrollment.objects.filter(class_obj=class_obj, is_active=True).select_related('student')
        results_qs = ExamResult.objects.filter(
            exam__subject__class_obj=class_obj, is_submitted=True, marks_obtained__isnull=False
        )
        att_qs = SessionAttendance.objects.filter(session__class_obj=class_obj)
        total_sessions = AttendanceSession.objects.filter(class_obj=class_obj).count()

        exam_map = _student_exam_map(results_qs)
        att_map_data = _student_att_map(att_qs)

        data_points = []
        for enr in enrollments:
            sid = enr.student_id
            ed = exam_map.get(sid, {})
            ad = att_map_data.get(sid, {})
            st = float(ed.get('total_marks', 0) or 0)
            sp = ed.get('total_possible', 0) or 0
            ep = (st / sp * 100) if sp else None
            attended = ad.get('attended', 0)
            ar = (attended / total_sessions * 100) if total_sessions else None

            if ep is not None and ar is not None:
                data_points.append({
                    'student_id': enr.student.id, 'student_name': enr.student.get_full_name(),
                    'attendance_rate': round(ar, 2), 'exam_percentage': round(ep, 2),
                })

        n = len(data_points)
        correlation = 0
        interpretation = "Insufficient data to calculate correlation."
        if n >= 3:
            x_vals = [d['attendance_rate'] for d in data_points]
            y_vals = [d['exam_percentage'] for d in data_points]
            x_mean = sum(x_vals) / n
            y_mean = sum(y_vals) / n
            num = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_vals, y_vals))
            dx = sum((x - x_mean) ** 2 for x in x_vals) ** 0.5
            dy = sum((y - y_mean) ** 2 for y in y_vals) ** 0.5
            if dx > 0 and dy > 0:
                correlation = round(num / (dx * dy), 4)
                interpretation = _interpret_correlation(correlation)

        return Response({
            'class': {'id': class_obj.id, 'name': class_obj.name},
            'correlation': correlation,
            'interpretation': interpretation,
            'sample_size': n,
            'data_points': data_points,
        })