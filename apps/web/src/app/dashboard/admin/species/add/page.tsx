'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';

export default function AddSpeciesPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    // Basic Info
    scientific_name: '',
    common_names: '',
    genus: '',
    family: 'Theraphosidae',

    // Care Level & Type
    care_level: 'beginner',
    type: 'terrestrial',
    temperament: '',
    native_region: '',

    // Size & Growth
    adult_size: '',
    growth_rate: '',

    // Temperature & Humidity
    temperature_min: '',
    temperature_max: '',
    humidity_min: '',
    humidity_max: '',

    // Enclosure
    enclosure_size_sling: '',
    enclosure_size_juvenile: '',
    enclosure_size_adult: '',
    substrate_type: '',
    substrate_depth: '',

    // Feeding
    prey_size: '',
    feeding_frequency_sling: '',
    feeding_frequency_juvenile: '',
    feeding_frequency_adult: '',

    // Behavior
    water_dish_required: true,
    webbing_amount: '',
    burrowing: false,

    // Care Guide
    care_guide: '',

    // Meta
    image_url: '',
    source_url: '',
    is_verified: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      // Parse common names into array
      const commonNamesArray = formData.common_names
        .split(',')
        .map(name => name.trim())
        .filter(name => name.length > 0);

      // Build payload
      const payload = {
        ...formData,
        common_names: commonNamesArray,
        temperature_min: formData.temperature_min ? parseFloat(formData.temperature_min) : null,
        temperature_max: formData.temperature_max ? parseFloat(formData.temperature_max) : null,
        humidity_min: formData.humidity_min ? parseFloat(formData.humidity_min) : null,
        humidity_max: formData.humidity_max ? parseFloat(formData.humidity_max) : null,
      };

      const response = await fetch(`${API_URL}/api/v1/species/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create species');
      }

      const newSpecies = await response.json();
      alert(`✅ Successfully added ${newSpecies.scientific_name}!`);

      // Clear form
      setFormData({
        scientific_name: '',
        common_names: '',
        genus: '',
        family: 'Theraphosidae',
        care_level: 'beginner',
        type: 'terrestrial',
        temperament: '',
        native_region: '',
        adult_size: '',
        growth_rate: '',
        temperature_min: '',
        temperature_max: '',
        humidity_min: '',
        humidity_max: '',
        enclosure_size_sling: '',
        enclosure_size_juvenile: '',
        enclosure_size_adult: '',
        substrate_type: '',
        substrate_depth: '',
        prey_size: '',
        feeding_frequency_sling: '',
        feeding_frequency_juvenile: '',
        feeding_frequency_adult: '',
        water_dish_required: true,
        webbing_amount: '',
        burrowing: false,
        care_guide: '',
        image_url: '',
        source_url: '',
        is_verified: true,
      });

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 flex items-center gap-2"
          >
            ← Back
          </button>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">
            Add New Species
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Quick entry form for adding tarantula species to the database
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">📋 Basic Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2">Scientific Name *</label>
                <input
                  type="text"
                  required
                  value={formData.scientific_name}
                  onChange={(e) => updateField('scientific_name', e.target.value)}
                  placeholder="Brachypelma hamorii"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2">Common Names (comma-separated) *</label>
                <input
                  type="text"
                  required
                  value={formData.common_names}
                  onChange={(e) => updateField('common_names', e.target.value)}
                  placeholder="Mexican Red Knee, Mexican Redknee Tarantula"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Genus *</label>
                <input
                  type="text"
                  required
                  value={formData.genus}
                  onChange={(e) => updateField('genus', e.target.value)}
                  placeholder="Brachypelma"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Family</label>
                <input
                  type="text"
                  value={formData.family}
                  onChange={(e) => updateField('family', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Care Level *</label>
                <select
                  required
                  value={formData.care_level}
                  onChange={(e) => updateField('care_level', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                >
                  <option value="beginner">🟢 Beginner</option>
                  <option value="intermediate">🟡 Intermediate</option>
                  <option value="advanced">🔴 Advanced</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Type *</label>
                <select
                  required
                  value={formData.type}
                  onChange={(e) => updateField('type', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                >
                  <option value="terrestrial">🏜️ Terrestrial</option>
                  <option value="arboreal">🌳 Arboreal</option>
                  <option value="fossorial">⛰️ Fossorial</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Temperament</label>
                <input
                  type="text"
                  value={formData.temperament}
                  onChange={(e) => updateField('temperament', e.target.value)}
                  placeholder="docile, skittish, defensive"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Native Region</label>
                <input
                  type="text"
                  value={formData.native_region}
                  onChange={(e) => updateField('native_region', e.target.value)}
                  placeholder="Mexico, Central America"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Size & Growth */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">📏 Size & Growth</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Adult Size</label>
                <input
                  type="text"
                  value={formData.adult_size}
                  onChange={(e) => updateField('adult_size', e.target.value)}
                  placeholder="5-6 inches"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Growth Rate</label>
                <select
                  value={formData.growth_rate}
                  onChange={(e) => updateField('growth_rate', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                >
                  <option value="">Select...</option>
                  <option value="slow">Slow</option>
                  <option value="medium">Medium</option>
                  <option value="fast">Fast</option>
                  <option value="very fast">Very Fast</option>
                </select>
              </div>
            </div>
          </div>

          {/* Climate */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">🌡️ Temperature & Humidity</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Min Temperature (°F)</label>
                <input
                  type="number"
                  value={formData.temperature_min}
                  onChange={(e) => updateField('temperature_min', e.target.value)}
                  placeholder="70"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Max Temperature (°F)</label>
                <input
                  type="number"
                  value={formData.temperature_max}
                  onChange={(e) => updateField('temperature_max', e.target.value)}
                  placeholder="85"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Min Humidity (%)</label>
                <input
                  type="number"
                  value={formData.humidity_min}
                  onChange={(e) => updateField('humidity_min', e.target.value)}
                  placeholder="60"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Max Humidity (%)</label>
                <input
                  type="number"
                  value={formData.humidity_max}
                  onChange={(e) => updateField('humidity_max', e.target.value)}
                  placeholder="70"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Enclosure */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">🏠 Enclosure</h2>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Sling Enclosure Size</label>
                <input
                  type="text"
                  value={formData.enclosure_size_sling}
                  onChange={(e) => updateField('enclosure_size_sling', e.target.value)}
                  placeholder='Small vial or 2x2x3"'
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Juvenile Enclosure Size</label>
                <input
                  type="text"
                  value={formData.enclosure_size_juvenile}
                  onChange={(e) => updateField('enclosure_size_juvenile', e.target.value)}
                  placeholder='5x5x5" or similar'
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Adult Enclosure Size</label>
                <input
                  type="text"
                  value={formData.enclosure_size_adult}
                  onChange={(e) => updateField('enclosure_size_adult', e.target.value)}
                  placeholder='10x10x10" or 5-10 gallon tank'
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Substrate Type</label>
                  <input
                    type="text"
                    value={formData.substrate_type}
                    onChange={(e) => updateField('substrate_type', e.target.value)}
                    placeholder="coco fiber, peat moss"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Substrate Depth</label>
                  <input
                    type="text"
                    value={formData.substrate_depth}
                    onChange={(e) => updateField('substrate_depth', e.target.value)}
                    placeholder="3-4 inches"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Feeding */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">🍽️ Feeding</h2>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Prey Size</label>
                <input
                  type="text"
                  value={formData.prey_size}
                  onChange={(e) => updateField('prey_size', e.target.value)}
                  placeholder="Appropriately sized prey (1/2 to 2/3 body length)"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Feeding Frequency - Sling</label>
                <input
                  type="text"
                  value={formData.feeding_frequency_sling}
                  onChange={(e) => updateField('feeding_frequency_sling', e.target.value)}
                  placeholder="Every 2-3 days"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Feeding Frequency - Juvenile</label>
                <input
                  type="text"
                  value={formData.feeding_frequency_juvenile}
                  onChange={(e) => updateField('feeding_frequency_juvenile', e.target.value)}
                  placeholder="Twice per week"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Feeding Frequency - Adult</label>
                <input
                  type="text"
                  value={formData.feeding_frequency_adult}
                  onChange={(e) => updateField('feeding_frequency_adult', e.target.value)}
                  placeholder="Once per week"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Behavior */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">🐛 Behavior</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.water_dish_required}
                    onChange={(e) => updateField('water_dish_required', e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Water Dish Required</span>
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.burrowing}
                    onChange={(e) => updateField('burrowing', e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Burrowing</span>
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2">Webbing Amount</label>
                <select
                  value={formData.webbing_amount}
                  onChange={(e) => updateField('webbing_amount', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                >
                  <option value="">Select...</option>
                  <option value="none">None</option>
                  <option value="light">Light</option>
                  <option value="moderate">Moderate</option>
                  <option value="heavy">Heavy</option>
                </select>
              </div>
            </div>
          </div>

          {/* Care Guide */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">📖 Care Guide</h2>
            <textarea
              value={formData.care_guide}
              onChange={(e) => updateField('care_guide', e.target.value)}
              placeholder="Comprehensive care information, behavior notes, and keeping tips..."
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* Meta */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">🔗 Additional Info</h2>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Image URL</label>
                <input
                  type="url"
                  value={formData.image_url}
                  onChange={(e) => updateField('image_url', e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Source URL</label>
                <input
                  type="url"
                  value={formData.source_url}
                  onChange={(e) => updateField('source_url', e.target.value)}
                  placeholder="https://source-website.com"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_verified}
                    onChange={(e) => updateField('is_verified', e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Mark as Verified</span>
                </label>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gradient-brand text-white py-4 rounded-xl font-semibold hover:brightness-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '⏳ Adding Species...' : '✅ Add Species'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/species')}
              className="px-8 py-4 border border-gray-300 dark:border-gray-600 rounded-xl font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
