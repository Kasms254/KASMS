import React, { useState } from 'react';
import { X, Upload } from 'lucide-react';
import * as superadminApi from '../../lib/superadmin-api';

export default function SchoolForm({ school, onSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    name: school?.name || '',
    subdomain: school?.subdomain || '',
    primary_color: school?.primary_color || '#004AAD',
    secondary_color: school?.secondary_color || '#FFFFFF',
    accent_color: school?.accent_color || '#000000',
    logo: null,
    favicon: null,
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [logoPreview, setLogoPreview] = useState(school?.logo || null);
  const [faviconPreview, setFaviconPreview] = useState(school?.favicon || null);
  const [createdAdmin, setCreatedAdmin] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e, field) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({ ...prev, [field]: file }));
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        if (field === 'logo') setLogoPreview(reader.result);
        if (field === 'favicon') setFaviconPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setCreatedAdmin(null);

    try {
      let result;
      if (school) {
        result = await superadminApi.updateSchool(school.id, formData);
      } else {
        result = await superadminApi.createSchool(formData);
        
        // Show created admin credentials
        if (result.created_admin) {
          setCreatedAdmin(result.created_admin);
          return; // Don't close yet, show credentials
        }
      }
      
      onSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (createdAdmin) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg max-w-md w-full p-6">
          <h2 className="text-2xl font-bold text-green-600 mb-4">School Created Successfully!</h2>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Save These Credentials</h3>
            <p className="text-sm text-yellow-700 mb-3">
              The school admin account has been created. Save these credentials now - they won't be shown again!
            </p>
            
            <div className="bg-white rounded p-3 space-y-2">
              <div>
                <span className="text-sm text-gray-600">Username:</span>
                <code className="block mt-1 p-2 bg-gray-50 rounded text-sm font-mono">
                  {createdAdmin.username}
                </code>
              </div>
              <div>
                <span className="text-sm text-gray-600">Password:</span>
                <code className="block mt-1 p-2 bg-gray-50 rounded text-sm font-mono">
                  {createdAdmin.password}
                </code>
              </div>
              {createdAdmin.svc_number && (
                <div>
                  <span className="text-sm text-gray-600">Service Number:</span>
                  <code className="block mt-1 p-2 bg-gray-50 rounded text-sm font-mono">
                    {createdAdmin.svc_number}
                  </code>
                </div>
              )}
            </div>
          </div>
          
          <button
            onClick={() => {
              setCreatedAdmin(null);
              onSuccess?.();
            }}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold">
            {school ? 'Edit School' : 'Create New School'}
          </h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Basic Information</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                School Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g., Kenya Army Training School"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Subdomain *
              </label>
              <div className="flex items-center">
                <input
                  type="text"
                  name="subdomain"
                  value={formData.subdomain}
                  onChange={handleChange}
                  required
                  disabled={!!school}
                  className="flex-1 px-3 py-2 border rounded-l-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                  placeholder="e.g., kats"
                  pattern="[a-z0-9-]+"
                />
                <span className="px-3 py-2 bg-gray-100 border border-l-0 rounded-r-lg text-sm text-gray-600">
                  .yourdomain.com
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Lowercase letters, numbers, and hyphens only. Cannot be changed after creation.
              </p>
            </div>
          </div>

          {/* Theme Colors */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Theme Colors</h3>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Primary Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    name="primary_color"
                    value={formData.primary_color}
                    onChange={handleChange}
                    className="h-10 w-20 border rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.primary_color}
                    onChange={(e) => setFormData(prev => ({ ...prev, primary_color: e.target.value }))}
                    className="flex-1 px-2 py-1 border rounded text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Secondary Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    name="secondary_color"
                    value={formData.secondary_color}
                    onChange={handleChange}
                    className="h-10 w-20 border rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.secondary_color}
                    onChange={(e) => setFormData(prev => ({ ...prev, secondary_color: e.target.value }))}
                    className="flex-1 px-2 py-1 border rounded text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Accent Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    name="accent_color"
                    value={formData.accent_color}
                    onChange={handleChange}
                    className="h-10 w-20 border rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.accent_color}
                    onChange={(e) => setFormData(prev => ({ ...prev, accent_color: e.target.value }))}
                    className="flex-1 px-2 py-1 border rounded text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Branding */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Branding</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Logo
                </label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  {logoPreview ? (
                    <div className="space-y-2">
                      <img src={logoPreview} alt="Logo preview" className="h-20 mx-auto object-contain" />
                      <button
                        type="button"
                        onClick={() => {
                          setLogoPreview(null);
                          setFormData(prev => ({ ...prev, logo: null }));
                        }}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                      <span className="text-sm text-gray-600">Upload Logo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileChange(e, 'logo')}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Favicon
                </label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  {faviconPreview ? (
                    <div className="space-y-2">
                      <img src={faviconPreview} alt="Favicon preview" className="h-20 mx-auto object-contain" />
                      <button
                        type="button"
                        onClick={() => {
                          setFaviconPreview(null);
                          setFormData(prev => ({ ...prev, favicon: null }));
                        }}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                      <span className="text-sm text-gray-600">Upload Favicon</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileChange(e, 'favicon')}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : (school ? 'Update School' : 'Create School')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
