'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';

interface ImportResult {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: Array<{
    index: number;
    scientific_name: string;
    error: string;
  }>;
  imported_species: Array<{
    scientific_name: string;
    common_names: string[];
  }>;
}

export default function BulkImportPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [jsonInput, setJsonInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const handleImport = async () => {
    setError('');
    setResult(null);
    setLoading(true);

    try {
      // Parse JSON
      let speciesData;
      try {
        speciesData = JSON.parse(jsonInput);
      } catch (e) {
        throw new Error('Invalid JSON format. Please check your input.');
      }

      // Ensure it's an array
      if (!Array.isArray(speciesData)) {
        throw new Error('JSON must be an array of species objects.');
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/species/bulk-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(speciesData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to import species');
      }

      const importResult = await response.json();
      setResult(importResult);

      // Clear input if successful
      if (importResult.successful > 0) {
        setJsonInput('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to import species');
    } finally {
      setLoading(false);
    }
  };

  const exampleJSON = `[
  {
    "scientific_name": "Grammostola pulchra",
    "common_names": ["Brazilian Black", "Brazilian Black Tarantula"],
    "genus": "Grammostola",
    "family": "Theraphosidae",
    "care_level": "beginner",
    "type": "terrestrial",
    "temperament": "docile, calm",
    "native_region": "Brazil",
    "adult_size": "7-8 inches",
    "growth_rate": "slow",
    "temperature_min": 70,
    "temperature_max": 80,
    "humidity_min": 65,
    "humidity_max": 75,
    "enclosure_size_sling": "Small vial or 2x2x3\\"",
    "enclosure_size_juvenile": "5x5x5\\"",
    "enclosure_size_adult": "10x10x10\\" or 5-10 gallon",
    "substrate_type": "coco fiber, peat moss",
    "substrate_depth": "4-5 inches",
    "prey_size": "Appropriately sized (1/2 to 2/3 body length)",
    "feeding_frequency_sling": "Every 2-3 days",
    "feeding_frequency_juvenile": "2-3 times per week",
    "feeding_frequency_adult": "Once per week",
    "water_dish_required": true,
    "webbing_amount": "moderate",
    "burrowing": true,
    "care_guide": "The Brazilian Black is one of the most docile tarantula species available in the hobby. It's known for its jet-black coloration and calm demeanor.\\n\\nThis terrestrial species is a slow grower but very hardy. It rarely kicks hairs and almost never displays defensive behavior.\\n\\nKeep substrate moist but not wet, with good ventilation.",
    "image_url": "",
    "source_url": "",
    "is_verified": true
  }
]`;

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 flex items-center gap-2"
          >
            ← Back
          </button>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">
            Bulk Import Species
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Import multiple species at once using JSON format
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-2">📝 Instructions</h2>
          <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200 text-sm">
            <li>Paste a JSON array of species objects below</li>
            <li>Each species must have at minimum: scientific_name, common_names (array), genus</li>
            <li>Use the example below as a template</li>
            <li>Duplicate species (by scientific name) will be skipped</li>
            <li>All imported species will be marked as verified</li>
          </ul>
        </div>

        {/* Example JSON */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Example JSON Format</h2>
            <button
              onClick={() => setJsonInput(exampleJSON)}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
            >
              Use Example
            </button>
          </div>
          <pre className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-xs text-gray-800 dark:text-gray-200">
            {exampleJSON}
          </pre>
        </div>

        {/* JSON Input */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">JSON Data</h2>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder="Paste your JSON array here..."
            rows={15}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-600 dark:bg-gray-700 dark:text-white font-mono text-sm"
          />
          <div className="mt-4 flex gap-4">
            <button
              onClick={handleImport}
              disabled={loading || !jsonInput.trim()}
              className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '⏳ Importing...' : '📥 Import Species'}
            </button>
            <button
              onClick={() => {
                setJsonInput('');
                setResult(null);
                setError('');
              }}
              className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-bold text-red-900 dark:text-red-100 mb-2">❌ Error</h3>
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Results Display */}
        {result && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Import Results</h2>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg text-center">
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{result.total}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg text-center">
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{result.successful}</p>
                <p className="text-sm text-green-600 dark:text-green-400">Successful</p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg text-center">
                <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{result.skipped}</p>
                <p className="text-sm text-yellow-600 dark:text-yellow-400">Skipped</p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg text-center">
                <p className="text-3xl font-bold text-red-600 dark:text-red-400">{result.failed}</p>
                <p className="text-sm text-red-600 dark:text-red-400">Failed</p>
              </div>
            </div>

            {/* Successfully Imported */}
            {result.imported_species.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-bold text-green-600 dark:text-green-400 mb-3">
                  ✅ Successfully Imported ({result.imported_species.length})
                </h3>
                <div className="space-y-2">
                  {result.imported_species.map((species, idx) => (
                    <div key={idx} className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                      <p className="font-semibold text-green-900 dark:text-green-100 italic">
                        {species.scientific_name}
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        {species.common_names.join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {result.errors.length > 0 && (
              <div>
                <h3 className="text-lg font-bold text-red-600 dark:text-red-400 mb-3">
                  ⚠️ Errors & Skipped ({result.errors.length})
                </h3>
                <div className="space-y-2">
                  {result.errors.map((err, idx) => (
                    <div key={idx} className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                      <p className="font-semibold text-red-900 dark:text-red-100">
                        {err.scientific_name} (Item #{err.index})
                      </p>
                      <p className="text-sm text-red-700 dark:text-red-300">{err.error}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 flex gap-4">
              <button
                onClick={() => router.push('/species')}
                className="flex-1 bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 transition-all"
              >
                View Species Database
              </button>
              <button
                onClick={() => {
                  setResult(null);
                  setError('');
                }}
                className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
              >
                Import More
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
