'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';

interface Species {
  id: string;
  scientific_name: string;
  common_names: string[];
  genus: string;
  family: string;
  care_level: string;
  type: string;
  is_verified: boolean;
  image_url?: string;
  submitted_by?: string;
}

export default function ManageSpeciesPage() {
  const router = useRouter();
  const { user: authUser, token, isAuthenticated, isLoading: authLoading } = useAuth();
  const [species, setSpecies] = useState<Species[]>([]);
  const [filteredSpecies, setFilteredSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVerified, setFilterVerified] = useState<'all' | 'verified' | 'unverified'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Species>>({});

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated || !token) {
      router.push('/login');
      return;
    }

    // Check if user is admin (you'll need to add is_admin to your user type)
    if (!authUser?.is_superuser) {
      router.push('/dashboard');
      return;
    }

    fetchSpecies();
  }, [authLoading, isAuthenticated, token]);

  const fetchSpecies = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/species/?limit=1000`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSpecies(data.species || data);
        setFilteredSpecies(data.species || data);
      }
    } catch (error) {
      console.error('Failed to fetch species:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let filtered = species;

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(s =>
        s.scientific_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.common_names?.some(name => name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        s.genus.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by verification status
    if (filterVerified === 'verified') {
      filtered = filtered.filter(s => s.is_verified);
    } else if (filterVerified === 'unverified') {
      filtered = filtered.filter(s => !s.is_verified);
    }

    setFilteredSpecies(filtered);
  }, [searchQuery, filterVerified, species]);

  const handleEdit = (s: Species) => {
    setEditingId(s.id);
    setEditForm({
      scientific_name: s.scientific_name,
      common_names: s.common_names,
      genus: s.genus,
      family: s.family,
      care_level: s.care_level,
      type: s.type,
      is_verified: s.is_verified,
    });
  };

  const handleSave = async (id: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/species/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });

      if (response.ok) {
        await fetchSpecies();
        setEditingId(null);
        setEditForm({});
      } else {
        alert('Failed to update species');
      }
    } catch (error) {
      console.error('Failed to update species:', error);
      alert('Error updating species');
    }
  };

  const handleDelete = async (id: string, scientificName: string) => {
    if (!confirm(`Are you sure you want to delete "${scientificName}"? This cannot be undone.`)) {
      return;
    }

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/species/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        await fetchSpecies();
      } else {
        alert('Failed to delete species');
      }
    } catch (error) {
      console.error('Failed to delete species:', error);
      alert('Error deleting species');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
  };

  if (loading || authLoading) {
    return (
      <DashboardLayout
        userName={authUser?.name ?? undefined}
        userEmail={authUser?.email ?? undefined}
        userAvatar={authUser?.image ?? undefined}
      >
        <div className="flex items-center justify-center py-12">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      userName={authUser?.name ?? undefined}
      userEmail={authUser?.email ?? undefined}
      userAvatar={authUser?.image ?? undefined}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            🛠️ Manage Species Database
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Edit, verify, or remove species from the database
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by scientific name, common name, or genus..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          <select
            value={filterVerified}
            onChange={(e) => setFilterVerified(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">All Species</option>
            <option value="verified">Verified Only</option>
            <option value="unverified">Unverified Only</option>
          </select>
        </div>

        {/* Results Count */}
        <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Showing {filteredSpecies.length} of {species.length} species
        </div>

        {/* Species Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Scientific Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Common Names
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Genus
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredSpecies.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    {editingId === s.id ? (
                      // Edit Mode
                      <>
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            value={editForm.scientific_name || ''}
                            onChange={(e) => setEditForm({ ...editForm, scientific_name: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            value={editForm.common_names?.join(', ') || ''}
                            onChange={(e) => setEditForm({ ...editForm, common_names: e.target.value.split(',').map(n => n.trim()) })}
                            placeholder="Comma-separated"
                            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            value={editForm.genus || ''}
                            onChange={(e) => setEditForm({ ...editForm, genus: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={editForm.type || ''}
                            onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                          >
                            <option value="terrestrial">Terrestrial</option>
                            <option value="arboreal">Arboreal</option>
                            <option value="fossorial">Fossorial</option>
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editForm.is_verified || false}
                              onChange={(e) => setEditForm({ ...editForm, is_verified: e.target.checked })}
                              className="rounded border-gray-300 text-purple-600 focus:ring-purple-600"
                            />
                            <span className="text-sm text-gray-900 dark:text-white">Verified</span>
                          </label>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSave(s.id)}
                              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancel}
                              className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      // View Mode
                      <>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white italic">
                            {s.scientific_name}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-700 dark:text-gray-300">
                            {s.common_names?.join(', ') || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-700 dark:text-gray-300">
                            {s.genus}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            {s.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            s.is_verified
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                          }`}>
                            {s.is_verified ? '✓ Verified' : 'Unverified'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEdit(s)}
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(s.id, s.scientific_name)}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredSpecies.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No species found matching your filters
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
