
import csv
import io
import logging
import re
import uuid

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError

from core.managers import get_current_school
from core.models import Class, SchoolMembership, UserImportAuditLog
from core.serializers import UserSerializer

logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = [
    'svc_number', 'username', 'first_name', 'last_name',
    'email', 'phone_number', 'rank', 'unit', 'class_name',
]

COLUMN_ALIASES = {
    'svc_number': {'svc_number', 'service_number', 'svc_no', 'service_no', 'serviceno'},
    'username': {'username', 'user_name'},
    'first_name': {'first_name', 'firstname', 'fname'},
    'last_name': {'last_name', 'lastname', 'lname'},
    'email': {'email', 'email_address'},
    'phone_number': {'phone_number', 'phone', 'phone_no', 'mobile', 'mobile_number'},
    'rank': {'rank'},
    'unit': {'unit'},
    'class_name': {'class_name', 'class'},
}

_ALIAS_TO_CANONICAL = {
    alias: canonical
    for canonical, aliases in COLUMN_ALIASES.items()
    for alias in aliases
}

IMPORT_CACHE_PREFIX = 'user_import:'
IMPORT_CACHE_TTL = 60 * 30  # 30 minutes

MAX_ROWS = 5000
MAX_FILE_BYTES = 5 * 1024 * 1024  # 5MB
CHUNK_SIZE = 200

CSV_FORMULA_PREFIXES = ('=', '+', '-', '@')

BLANK_GUARD_FIELDS = ('svc_number', 'first_name', 'last_name')


class UserImportError(Exception):
    """Fatal, whole-file import error (bad columns, bad encoding, empty file, etc)."""


def get_default_password():
    """Shared initial password assigned to every student created via CSV import.

    Every imported student gets the same value (settings.STUDENT_IMPORT_DEFAULT_PASSWORD);
    they're forced onto the change-password flow on first login via
    User.must_change_password + ForcePasswordChangePermission.
    """
    password = settings.STUDENT_IMPORT_DEFAULT_PASSWORD
    try:
        validate_password(password)
    except DjangoValidationError as exc:
        raise UserImportError(
            "The configured default student password does not meet the password "
            "policy: " + " ".join(exc.messages)
        )
    return password


def _normalize_header_text(value):
    value = (value or '').strip().lower()
    return re.sub(r'[\s\-]+', '_', value)


def _sanitize_cell(value):
    if value is None:
        return ''
    value = value.strip()
    if value and value[0] in CSV_FORMULA_PREFIXES:
        value = "'" + value
    return value


def parse_csv_file(uploaded_file):

    size = getattr(uploaded_file, 'size', None)
    if size is not None and size > MAX_FILE_BYTES:
        raise UserImportError(
            f"File is too large ({size} bytes). Maximum allowed is {MAX_FILE_BYTES} bytes."
        )

    try:
        raw_bytes = uploaded_file.read()
    except Exception:
        raise UserImportError("Unable to read the uploaded file.")

    try:
        text = raw_bytes.decode('utf-8-sig')
    except UnicodeDecodeError:
        raise UserImportError("File must be UTF-8 encoded.")

    if not text.strip():
        raise UserImportError("The uploaded CSV is empty.")

    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        raise UserImportError("The uploaded CSV has no header row.")

    header_map = {}
    canonical_source = {}  # canonical name -> the raw header that claimed it
    for raw_header in reader.fieldnames:
        canonical = _ALIAS_TO_CANONICAL.get(_normalize_header_text(raw_header))
        header_map[raw_header] = canonical
        if canonical:
            if canonical in canonical_source:
                raise UserImportError(
                    f"Columns '{canonical_source[canonical]}' and '{raw_header}' both look like "
                    f"the {canonical} column. Remove one."
                )
            canonical_source[canonical] = raw_header

    missing = [c for c in REQUIRED_COLUMNS if c not in canonical_source]
    if missing:
        raise UserImportError(f"Missing required column(s): {', '.join(missing)}")

    rows = []
    for line_number, raw_row in enumerate(reader, start=2):  # header is line 1
        if raw_row is None:
            continue

        overflow = raw_row.pop(None, None)

        values = {}
        for raw_key, raw_value in raw_row.items():
            canonical = header_map.get(raw_key)
            if canonical is None:
                continue  # unmapped column (Timestamp, Course Enrolled, ...) — ignored
            values[canonical] = _sanitize_cell(raw_value)

        if all(v == '' for v in values.values()):
            continue  # skip fully blank rows

        values['_line_number'] = line_number
        values['_overflow'] = bool(overflow)
        rows.append(values)

    if not rows:
        raise UserImportError("The CSV contains no data rows.")

    if len(rows) > MAX_ROWS:
        raise UserImportError(
            f"CSV contains {len(rows)} rows; the maximum per import is {MAX_ROWS}."
        )

    return rows


def _build_class_name_map(school):
    classes = Class.objects.filter(school=school, is_active=True)

    name_map = {}
    ambiguous_names = set()
    for cls in classes:
        key = cls.name.strip().lower()
        if key in name_map:
            ambiguous_names.add(key)
        else:
            name_map[key] = cls

    for name in ambiguous_names:
        name_map.pop(name, None)

    return name_map, ambiguous_names


def _resolve_authorized_school(request):

    school = get_current_school() or getattr(request.user, 'school', None)
    if not school:
        raise UserImportError(
            "No school context resolved for this import. Ensure X-School-Code is set."
        )

    if request.user.role != 'superadmin':
        is_member = SchoolMembership.objects.filter(
            user=request.user, school=school, status=SchoolMembership.Status.ACTIVE,
        ).exists()
        if not is_member:
            raise UserImportError("You do not have an active membership at this school.")

    return school


def _check_in_file_duplicate(row, field_name, seen_keys, errors):
    value = (row.get(field_name) or '').strip().lower()
    if not value:
        return
    key = (field_name, value)
    if key in seen_keys:
        errors.setdefault(field_name, []).append(
            f"Duplicate {field_name} within this file (first seen on row {seen_keys[key]})."
        )
    else:
        seen_keys[key] = row['_line_number']


def _validate_row(row, class_map, ambiguous_names, request, seen_keys, password):

    errors = {}

    if row.get('_overflow'):
        errors['_row'] = ['Row has more columns than the header — check for stray commas.']

    class_name_raw = (row.get('class_name') or '').strip()
    class_obj = None
    if not class_name_raw:
        errors['class_name'] = ['This field is required.']
    else:
        key = class_name_raw.lower()
        if key in ambiguous_names:
            errors['class_name'] = [
                f"Class name '{class_name_raw}' matches more than one class. "
                "Ask an administrator to make class names unique before importing."
            ]
        else:
            class_obj = class_map.get(key)
            if class_obj is None:
                errors['class_name'] = [f"No active class found named '{class_name_raw}'."]

    for field_name in ('svc_number', 'email', 'username'):
        _check_in_file_duplicate(row, field_name, seen_keys, errors)


    for field_name in BLANK_GUARD_FIELDS:
        if not (row.get(field_name) or '').strip():
            errors.setdefault(field_name, []).append('This field may not be blank.')

    payload = {
        'username': row.get('username', ''),
        'svc_number': row.get('svc_number', ''),
        'first_name': row.get('first_name', ''),
        'last_name': row.get('last_name', ''),
        'email': row.get('email', ''),
        'phone_number': row.get('phone_number', ''),
        'rank': row.get('rank') or None,
        'unit': row.get('unit') or None,
        'role': 'student',
        'class_obj': class_obj.pk if class_obj else None,
        'password': password,
        'password2': password,
        'is_active': True,
    }

    serializer = UserSerializer(data=payload, context={'request': request})
    if not serializer.is_valid():
        for field_name, messages in serializer.errors.items():
            errors.setdefault(field_name, []).extend(str(m) for m in messages)

    result = {
        'line_number': row['_line_number'],
        'input': {k: v for k, v in row.items() if not k.startswith('_')},
        'class_name': class_name_raw,
        'class_id': str(class_obj.pk) if class_obj else None,
        'is_valid': not errors,
        'errors': errors,
    }
    return result, serializer


def build_preview(uploaded_file, request):

    school = _resolve_authorized_school(request)

    rows = parse_csv_file(uploaded_file)

    class_map, ambiguous_names = _build_class_name_map(school)
    default_password = get_default_password()

    seen_keys = {}
    row_results = []
    for row in rows:
        result, _serializer = _validate_row(
            row, class_map, ambiguous_names, request, seen_keys, password=default_password,
        )
        row_results.append(result)

    valid_rows = [r for r in row_results if r['is_valid']]
    invalid_rows = [r for r in row_results if not r['is_valid']]

    import_id = uuid.uuid4().hex
    cache.set(
        f'{IMPORT_CACHE_PREFIX}{import_id}',
        {
            'school_id': str(school.pk),
            'performed_by_id': request.user.pk,
            'filename': getattr(uploaded_file, 'name', 'upload.csv'),
            'rows': row_results,
        },
        timeout=IMPORT_CACHE_TTL,
    )

    logger.info(
        "Student import preview %s: school=%s valid=%d invalid=%d",
        import_id, school.pk, len(valid_rows), len(invalid_rows),
    )

    return {
        'import_id': import_id,
        'filename': getattr(uploaded_file, 'name', 'upload.csv'),
        'total_rows': len(row_results),
        'valid_count': len(valid_rows),
        'invalid_count': len(invalid_rows),
        'rows': row_results,
    }


def get_staged_import(import_id, request):

    staged = cache.get(f'{IMPORT_CACHE_PREFIX}{import_id}')
    if not staged:
        raise UserImportError("This import has expired or does not exist. Please re-upload.")

    school = _resolve_authorized_school(request)
    if str(school.pk) != staged['school_id']:
        raise UserImportError("This import does not belong to your school.")

    return staged, school


def _chunked(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def commit_import(import_id, request):

    staged, school = get_staged_import(import_id, request)

    candidate_rows = [r for r in staged['rows'] if r['is_valid']]
    skipped_rows = [r for r in staged['rows'] if not r['is_valid']]

    class_map, ambiguous_names = _build_class_name_map(school)
    default_password = get_default_password()
    seen_keys = {}

    created = []
    failed = []

    for chunk in _chunked(candidate_rows, CHUNK_SIZE):
        with transaction.atomic():
            for cached_row in chunk:
                raw_row = dict(cached_row['input'])
                raw_row['_line_number'] = cached_row['line_number']
                raw_row['_overflow'] = False

                result, serializer = _validate_row(
                    raw_row, class_map, ambiguous_names, request, seen_keys,
                    password=default_password,
                )

                if not result['is_valid']:
                    failed.append({
                        'line_number': cached_row['line_number'],
                        'input': cached_row['input'],
                        'errors': result['errors'],
                    })
                    continue

                try:
                    with transaction.atomic():  # per-row savepoint
                        user = serializer.save()
                except Exception:
                    logger.exception(
                        "Student import row failed to save (line %s, school %s)",
                        cached_row['line_number'], school.pk,
                    )
                    failed.append({
                        'line_number': cached_row['line_number'],
                        'input': cached_row['input'],
                        'errors': {'_row': ['Unexpected error while saving this row.']},
                    })
                    continue

                created.append({
                    'line_number': cached_row['line_number'],
                    'svc_number': user.svc_number,
                    'username': user.username,
                    'full_name': f"{user.first_name} {user.last_name}".strip(),
                    'class_name': cached_row.get('class_name'),
                    'password': default_password,
                })

    cache.delete(f'{IMPORT_CACHE_PREFIX}{import_id}')

    ip_address = request.META.get('REMOTE_ADDR')
    UserImportAuditLog.objects.create(
        school=school,
        action='completed' if created else 'failed',
        performed_by=request.user,
        metadata={
            'filename': staged.get('filename'),
            'ip_address': ip_address,
            'total_rows': len(staged['rows']),
            'created_count': len(created),
            'skipped_count': len(skipped_rows),
            'failed_count': len(failed),
            'created_svc_numbers': [c['svc_number'] for c in created],
        },
    )

    logger.info(
        "Student import %s confirmed by %s: school=%s created=%d skipped=%d failed=%d",
        import_id, request.user.pk, school.pk, len(created), len(skipped_rows), len(failed),
    )

    return {
        'import_id': import_id,
        'created_count': len(created),
        'skipped_count': len(skipped_rows),
        'failed_count': len(failed),
        'created': created,
        'skipped': skipped_rows,
        'failed': failed,
    }
