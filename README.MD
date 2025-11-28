AUTHENTICATION:
- All endpoints require authentication
- Admin-only endpoints are marked with [ADMIN]
- Use Bearer Token authentication

AUTH URL:
LOGIN:
http://127.0.0.1:8000/api/auth/login/

LOGOUT:
http://127.0.0.1:8000/api/auth/logout/


BASE URL: /api/

FOR ADMIN USERS
-----------------------------------
USERS ENDPOINTS
-----------------------------------
GET     /users/                     List all users [ADMIN]
POST    /users/                     Register new user [ADMIN]
GET     /users/{id}/                Get user details [ADMIN]
PUT     /users/{id}/                Update user [ADMIN]
PATCH   /users/{id}/                Partial update [ADMIN]
DELETE  /users/{id}/                Delete user [ADMIN]

GET     /users/instructors/         Get all instructors [ADMIN]
GET     /users/students/            Get all students [ADMIN]
POST    /users/{id}/activate/       Activate user [ADMIN]
POST    /users/{id}/deactivate/     Deactivate user [ADMIN]


-----------------------------------
COURSES ENDPOINTS
-----------------------------------
GET     /courses/                   List all courses [ADMIN]
POST    /courses/                   Create course [ADMIN]
GET     /courses/{id}/              Get course details [ADMIN]
PUT     /courses/{id}/              Update course [ADMIN]
PATCH   /courses/{id}/              Partial update [ADMIN]
DELETE  /courses/{id}/              Delete course [ADMIN]

GET     /courses/active/            Get active courses [ADMIN]
GET     /courses/{id}/classes/      Get classes in course [ADMIN]


-----------------------------------
CLASSES ENDPOINTS
-----------------------------------
GET     /classes/                   List all classes [ADMIN]
POST    /classes/                   Create class [ADMIN]
GET     /classes/{id}/              Get class details [ADMIN]
PUT     /classes/{id}/              Update class [ADMIN]
PATCH   /classes/{id}/              Partial update [ADMIN]
DELETE  /classes/{id}/              Delete class [ADMIN]

GET     /classes/{id}/subjects/     Get subjects in class [ADMIN]
GET     /classes/{id}/enrolled_students/  Get enrolled students [ADMIN]
POST    /classes/{id}/assign_instructor/  Assign instructor [ADMIN]
        Body: {"instructor_id": 2}


-----------------------------------
SUBJECTS ENDPOINTS
-----------------------------------
GET     /subjects/                  List all subjects [ADMIN]
POST    /subjects/                  Create subject [ADMIN]
GET     /subjects/{id}/             Get subject details [ADMIN]
PUT     /subjects/{id}/             Update subject [ADMIN]
PATCH   /subjects/{id}/             Partial update [ADMIN]
DELETE  /subjects/{id}/             Delete subject [ADMIN]

POST    /subjects/{id}/assign_instructor/  Assign instructor [ADMIN]
        Body: {"instructor_id": 2}



-----------------------------------
NOTICES ENDPOINTS
-----------------------------------
GET     /notices/                   List all notices [ALL USERS]
POST    /notices/                   Create notice [ADMIN]
GET     /notices/{id}/              Get notice details [ALL USERS]
PUT     /notices/{id}/              Update notice [ADMIN]
PATCH   /notices/{id}/              Partial update [ADMIN]
DELETE  /notices/{id}/              Delete notice [ADMIN]

GET     /notices/active/            Get active notices [ALL USERS]
GET     /notices/urgent/            Get urgent notices [ALL USERS]


-----------------------------------
ENROLLMENTS ENDPOINTS
-----------------------------------
GET     /enrollments/               List all enrollments [ADMIN]
POST    /enrollments/               Enroll student [ADMIN]
GET     /enrollments/{id}/          Get enrollment details [ADMIN]
PUT     /enrollments/{id}/          Update enrollment [ADMIN]
PATCH   /enrollments/{id}/          Partial update [ADMIN]
DELETE  /enrollments/{id}/          Delete enrollment [ADMIN]

POST    /enrollments/{id}/complete/ Mark as completed [ADMIN]
POST    /enrollments/{id}/withdraw/ Withdraw student [ADMIN]



-----------------------------------
QUERY PARAMETERS
-----------------------------------
Pagination:
  ?page=2
  ?page_size=50

Ordering:
  ?ordering=created_at          (ascending)
  ?ordering=-created_at         (descending)
  ?ordering=name,-created_at    (multiple)


FOR instructor USERS
-----------------------------------
INSTRUCTOR DASHBOARD ENDPOINTS
-----------------------------------
AUTHENTICATION:
        All endpoints require authentication
LOGIN:
 http://127.0.0.1:8000/api/auth/login/

LOGOUT:
 http://127.0.0.1:8000/api/auth/logout/

1. Create Exam  - POST /api/exams/
2. List Exams - GET /api/exams/
3. Get My Exams (Instructor Only) - GET /api/exams/my_exams/
4. Get Exam Results - GET /api/exams/{exam_id}/results/
5. Auto-Generate Result Entries - POST /api/exams/{exam_id}/generate_results/
6. Grade Single Result - PUT /api/exam-results/{result_id}/
7. Bulk Grade Results - POST /api/exam-results/bulk_grade/
8. Get Student Results - GET /api/exam-results/student_results/?student_id=5
9. Mark Single Attendance - POST /api/attendance/
10. Bulk Mark Attendance - POST /api/attendance/bulk_mark/
11. Get Class Attendance for Date - GET /api/attendance/class_attendance/?class_id=1&date=2025-11-18
12. Get Student Attendance Summary - GET /api/attendance/student_attendance/?student_id=5
13. Create Class Notice - POST /api/class-notices/
14. List My Notices - GET /api/class-notices/my_notices/
15. Filter Notices - GET /api/class-notices/?class_obj=1
                GET /api/class-notices/?priority=urgent
                GET /api/class-notices/?subject=2
16. Create Exam Report - POST /api/exam-reports/
17. Get Detailed Report - GET /api/exam-reports/{report_id}/detailed_report/
-----------------------------------


