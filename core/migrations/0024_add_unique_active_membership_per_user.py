from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0023_merge_20260527_1039'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='schoolmembership',
            constraint=models.UniqueConstraint(
                condition=models.Q(status='active'),
                fields=['user'],
                name='unique_active_membership_per_user',
            ),
        ),
    ]
