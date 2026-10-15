
import factory
from django.contrib.auth import get_user_model

User = get_user_model()


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

        django_get_or_create = ("username",)

  
    username = factory.Sequence(lambda n: f"user{n}")
    first_name = factory.Sequence(lambda n: f"First{n}")
    last_name = factory.Sequence(lambda n: f"Last{n}")
    email = factory.LazyAttribute(lambda o: f"{o.username}@test.local")

    must_change_password = False
    is_active = True

    role = "admin"  # Override with role='student', 'instructor', etc. as needed

    phone_number = factory.Sequence(lambda n: f"+2547{n:08d}")
    svc_number = factory.Sequence(lambda n: f"SVC{n:06d}")

    @factory.post_generation
    def password(obj, create, extracted, **kwargs):

        raw = extracted if extracted is not None else "testpass123"
        obj.set_password(raw)
        if create:
            obj.save(update_fields=["password"])


class SuperAdminFactory(UserFactory):
    """A superadmin user that belongs to no school (global admin)."""
    role = "superadmin"
    is_staff = True
    username = factory.Sequence(lambda n: f"superadmin{n}")
    svc_number = factory.Sequence(lambda n: f"SA{n:06d}")


class InstructorFactory(UserFactory):
    role = "instructor"
    username = factory.Sequence(lambda n: f"instructor{n}")
    svc_number = factory.Sequence(lambda n: f"INST{n:06d}")


class StudentFactory(UserFactory):
    role = "student"
    username = factory.Sequence(lambda n: f"student{n}")
    svc_number = factory.Sequence(lambda n: f"STU{n:06d}")
