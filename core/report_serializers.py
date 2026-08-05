from rest_framework import serializers
from .models import CommandantSchoolReport, CommandantReportAuditLog, User, School


class CommandantSchoolReportCreateSerializer(serializers.ModelSerializer):

    class Meta:
        model = CommandantSchoolReport
        fields = [
            'id',
            'title',
            'reporting_period_start',
            'reporting_period_end',
            'report_date',
            'observations',
            'challenges',
            'achievements',
            'recommendations',
            'overall_remarks',
        ]
        read_only_fields = ['id']

    def validate(self, attrs):
        start = attrs.get(
            'reporting_period_start',
            getattr(self.instance, 'reporting_period_start', None),
        )
        end = attrs.get(
            'reporting_period_end',
            getattr(self.instance, 'reporting_period_end', None),
        )
        if start and end and start > end:
            raise serializers.ValidationError(
                {'reporting_period_end': 'End date must be after start date.'}
            )
        return attrs


class CommandantSchoolReportListSerializer(serializers.ModelSerializer):

    school_name = serializers.CharField(source='school.name', read_only=True)
    school_code = serializers.CharField(source='school.code', read_only=True)
    commandant_name = serializers.SerializerMethodField()
    commandant_rank = serializers.CharField(
        source='commandant.rank', read_only=True, allow_null=True
    )

    class Meta:
        model = CommandantSchoolReport
        fields = [
            'id',
            'title',
            'school_name',
            'school_code',
            'commandant_name',
            'commandant_rank',
            'reporting_period_start',
            'reporting_period_end',
            'report_date',
            'status',
            'submitted_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields

    def get_commandant_name(self, obj):
        return obj.commandant.get_full_name() if obj.commandant else None


class CommandantSchoolReportDetailSerializer(serializers.ModelSerializer):

    school_name = serializers.CharField(source='school.name', read_only=True)
    school_code = serializers.CharField(source='school.code', read_only=True)
    school_city = serializers.CharField(source='school.city', read_only=True)
    school_address = serializers.CharField(source='school.address', read_only=True)
    school_logo = serializers.SerializerMethodField()

    commandant_name = serializers.SerializerMethodField()
    commandant_svc_number = serializers.CharField(
        source='commandant.svc_number', read_only=True, allow_null=True
    )
    commandant_rank = serializers.CharField(
        source='commandant.rank', read_only=True, allow_null=True
    )
    commandant_rank_display = serializers.SerializerMethodField()

    submitted_by_name = serializers.SerializerMethodField()
    statistics = serializers.SerializerMethodField()
    audit_logs = serializers.SerializerMethodField()

    class Meta:
        model = CommandantSchoolReport
        fields = [
            'id',
            'title',
            'school_name',
            'school_code',
            'school_city',
            'school_address',
            'school_logo',
            'commandant_name',
            'commandant_svc_number',
            'commandant_rank',
            'commandant_rank_display',
            'reporting_period_start',
            'reporting_period_end',
            'report_date',
            'status',
            'submitted_at',
            'submitted_by_name',
            'observations',
            'challenges',
            'achievements',
            'recommendations',
            'overall_remarks',
            'statistics',
            'audit_logs',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields

    def get_school_logo(self, obj):
        if obj.school and obj.school.logo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.school.logo.url)
            return obj.school.logo.url
        return None

    def get_commandant_name(self, obj):
        return obj.commandant.get_full_name() if obj.commandant else None

    def get_commandant_rank_display(self, obj):
        if obj.commandant and obj.commandant.rank:
            return obj.commandant.get_rank_display()
        return None

    def get_submitted_by_name(self, obj):
        return obj.submitted_by.get_full_name() if obj.submitted_by else None

    def get_statistics(self, obj):
        if obj.statistics_snapshot:
            return obj.statistics_snapshot
        from .services.report_service import CommandantReportService
        return CommandantReportService.compute_statistics(
            obj.school,
            obj.reporting_period_start,
            obj.reporting_period_end,
        )

    def get_audit_logs(self, obj):
        logs = obj.audit_logs.order_by('-timestamp').select_related('performed_by')[:20]
        return [
            {
                'action': log.action,
                'performed_by': (
                    log.performed_by.get_full_name() if log.performed_by else 'System'
                ),
                'notes': log.notes,
                'timestamp': log.timestamp,
            }
            for log in logs
        ]


class CommandantReportAuditLogSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CommandantReportAuditLog
        fields = ['id', 'action', 'performed_by_name', 'notes', 'metadata', 'timestamp']

    def get_performed_by_name(self, obj):
        return obj.performed_by.get_full_name() if obj.performed_by else 'System'
