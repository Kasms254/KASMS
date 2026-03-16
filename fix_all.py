from datetime import datetime, time
from django.utils import timezone
from core.models import Notice, ClassNotice
 
print("=" * 60)
print("FIX 1: Converting date -> datetime in expiry_date fields")
print("=" * 60)
 
# Fix Notice records
fixed_notice = 0
for n in Notice.all_objects.filter(expiry_date__isnull=False):
    if type(n.expiry_date).__name__ == 'date':
        new_val = timezone.make_aware(datetime.combine(n.expiry_date, time.max))
        Notice.all_objects.filter(pk=n.pk).update(expiry_date=new_val)
        fixed_notice += 1
        print(f"  Fixed Notice #{n.pk}: '{n.title}' -> {new_val}")
 
print(f"\nFixed {fixed_notice} Notice records")
 
# Fix ClassNotice records
fixed_cn = 0
for cn in ClassNotice.all_objects.filter(expiry_date__isnull=False):
    if type(cn.expiry_date).__name__ == 'date':
        new_val = timezone.make_aware(datetime.combine(cn.expiry_date, time.max))
        ClassNotice.all_objects.filter(pk=cn.pk).update(expiry_date=new_val)
        fixed_cn += 1
        print(f"  Fixed ClassNotice #{cn.pk}: '{cn.title}' -> {new_val}")
 
print(f"\nFixed {fixed_cn} ClassNotice records")
 
# Verify no bad records remain
remaining_bad = 0
for n in Notice.all_objects.filter(expiry_date__isnull=False):
    if type(n.expiry_date).__name__ == 'date':
        remaining_bad += 1
for cn in ClassNotice.all_objects.filter(expiry_date__isnull=False):
    if type(cn.expiry_date).__name__ == 'date':
        remaining_bad += 1
 
if remaining_bad == 0:
    print("\n✓ All expiry_date values are now proper datetime objects!")
else:
    print(f"\n✗ WARNING: {remaining_bad} records still have date objects!")
 
print("\nDone!")