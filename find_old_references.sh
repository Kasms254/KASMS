#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# Run this from your project root (where manage.py is):
#   bash find_old_references.sh
#
# It finds every remaining reference to the old User->School FK
# pattern that will break now that User.school is a @property
# resolved through SchoolMembership.
# ──────────────────────────────────────────────────────────────────

echo "======================================================"
echo " Scanning for old User.school FK references..."
echo "======================================================"
echo ""

echo "── 1. School.users (old reverse relation, now gone) ──"
grep -rn "\.users\." --include="*.py" . | grep -v "venv/" | grep -v "__pycache__" | grep -v ".pyc" | grep -v "migrations/"
echo ""

echo "── 2. Direct self.users on School model ──"
grep -rn "self\.users" --include="*.py" . | grep -v "venv/" | grep -v "__pycache__" | grep -v "migrations/"
echo ""

echo "── 3. user.school = or user.school_id = (old FK assignment) ──"
grep -rn "user\.school\s*=" --include="*.py" . | grep -v "venv/" | grep -v "__pycache__" | grep -v "migrations/" | grep -v "@property"
grep -rn "school_id\s*=" --include="*.py" . | grep -v "venv/" | grep -v "__pycache__" | grep -v "migrations/" | grep -v "school_id.*request" | grep -v "school_id.*data"
echo ""

echo "── 4. filter(school=user.school) patterns ──"
grep -rn "school=user\.school" --include="*.py" . | grep -v "venv/" | grep -v "__pycache__" | grep -v "migrations/"
grep -rn "school=.*\.school" --include="*.py" . | grep -v "venv/" | grep -v "__pycache__" | grep -v "migrations/" | grep -v "class_obj.school" | grep -v "subject.school" | grep -v "exam.school" | grep -v "session.school"
echo ""

echo "── 5. User.objects.filter(school=...) ──"
grep -rn "User.*filter.*school=" --include="*.py" . | grep -v "venv/" | grep -v "__pycache__" | grep -v "migrations/"
echo ""

echo "── 6. admin.py references ──"
grep -rn "users\|\.school" --include="admin.py" . | grep -v "venv/" | grep -v "__pycache__" | grep -v "migrations/"
echo ""

echo "======================================================"
echo " Review each match above. Common fixes:"
echo "  self.users.filter(role=X)  →  self.memberships.filter(role=X, status='active')"
echo "  user.school (reads)        →  already works (it's a @property now)"
echo "  user.school = X (writes)   →  create a SchoolMembership instead"
echo "  filter(school=user.school) →  still works but verify it's not None"
echo "======================================================"






