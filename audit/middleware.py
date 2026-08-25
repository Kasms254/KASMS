import uuid

from django.utils.deprecation import MiddlewareMixin


class RequestIDMiddleware(MiddlewareMixin):

    def process_request(self, request):
        request.audit_request_id = uuid.uuid4().hex
