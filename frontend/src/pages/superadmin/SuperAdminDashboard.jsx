import React, { useState } from 'react';
import SchoolsList from './SchoolsList';
import SchoolForm from './SchoolForm';

export default function SuperAdminDashboard() {
  const [showForm, setShowForm] = useState(false);
  const [editingSchool, setEditingSchool] = useState(null);

  const handleCreateSchool = () => {
    setEditingSchool(null);
    setShowForm(true);
  };

  const handleEditSchool = (school) => {
    setEditingSchool(school);
    setShowForm(true);
  };

  const handleSuccess = () => {
    setShowForm(false);
    setEditingSchool(null);
    // List will auto-refresh
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingSchool(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        <SchoolsList 
          onCreateSchool={handleCreateSchool}
          onEditSchool={handleEditSchool}
        />
      </div>

      {showForm && (
        <SchoolForm
          school={editingSchool}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}