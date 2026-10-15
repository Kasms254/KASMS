
import factory
import uuid
from core.models import School, SchoolMembership
from tests.factories.users import UserFactory


class SchoolFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = School
        django_get_or_create = ("code",)

    code = factory.Sequence(lambda n: f"SCH{n:04d}")
    name = factory.Sequence(lambda n: f"Test School {n}")
    short_name = factory.LazyAttribute(lambda o: o.name[:20])
    email = factory.Sequence(lambda n: f"school{n}@test.local")
    phone = factory.Sequence(lambda n: f"+2547{n:08d}")
    address = "123 Test Street"
    city = "Nairobi"
    is_active = True
    max_students = 5000
    max_instructors = 500


class SchoolMembershipFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = SchoolMembership

    user = factory.SubFactory(UserFactory)
    school = factory.SubFactory(SchoolFactory)
    role = SchoolMembership.Role.ADMIN
    status = SchoolMembership.Status.ACTIVE
