'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';

interface Species {
  id: string;
  scientific_name: string;
  common_names: string[];
  genus: string;
  species: string;
  type: string;
  native_region: string;
  care_level: string;
  min_temperature: number | null;
  max_temperature: number | null;
  min_humidity: number | null;
  max_humidity: number | null;
  adult_size_cm: number | null;
  growth_rate: string | null;
  temperament: string | null;
  is_verified: boolean;
  image_url: string | null;
}

export default function SpeciesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [species, setSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    careLevel: '',
    type: '',
    region: '',
    verifiedOnly: false,
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchSpecies();
  }, [filters.verifiedOnly]);

  const fetchSpecies = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.verifiedOnly) params.append('verified_only', 'true');

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/species?${params}`);
      const data = await response.json();
      setSpecies(data);
    } catch (error) {
      console.error('Error fetching species:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSpecies = species.filter(s => {
    const matchesSearch =
      searchTerm === '' ||
      s.scientific_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.common_names.some(name => name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCareLevel = !filters.careLevel || s.care_level === filters.careLevel;
    const matchesType = !filters.type || s.type === filters.type;
    const matchesRegion = !filters.region || s.native_region?.toLowerCase().includes(filters.region.toLowerCase());

    return matchesSearch && matchesCareLevel && matchesType && matchesRegion;
  });

  const getCareColor = (level: string) => {
    switch (level) {
      case 'beginner': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'advanced': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const getCareIcon = (level: string) => {
    switch (level) {
      case 'beginner': return '🟢';
      case 'intermediate': return '🟡';
      case 'advanced': return '🔴';
      default: return '⚪';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'terrestrial': return '🏜️';
      case 'arboreal': return '🌳';
      case 'fossorial': return '⛰️';
      default: return '🕷️';
    }
  };

  // Placeholder image based on type
  const getPlaceholderImage = (type: string) => {
    const colors = {
      terrestrial: 'from-amber-200 to-orange-300 dark:from-amber-800 dark:to-orange-900',
      arboreal: 'from-green-200 to-emerald-300 dark:from-green-800 dark:to-emerald-900',
      fossorial: 'from-stone-200 to-gray-300 dark:from-stone-800 dark:to-gray-900',
      default: 'from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600'
    };
    return colors[type as keyof typeof colors] || colors.default;
  };

  const toggleFilter = (filterKey: 'careLevel' | 'type' | 'region', value: string) => {
    setFilters(prev => ({
      ...prev,
      [filterKey]: prev[filterKey] === value ? '' : value
    }));
  };

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-3 text-gray-900 dark:text-white">Species Database</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Browse comprehensive care guides for {species.length} tarantula species
          </p>
        </div>

        {/* Search Bar */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search Input */}
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">🔍</span>
              <input
                type="text"
                placeholder="Search by scientific or common name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Filter Toggle & View Mode */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg transition-all ${
                  showFilters
                    ? 'bg-primary-600 text-white shadow-md'
                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <span>🔧</span>
                <span className="hidden sm:inline">Filters</span>
                <span className={`transition-transform inline-block ${showFilters ? 'rotate-180' : ''}`}>▼</span>
              </button>

              {/* View Mode Toggle */}
              <div className="hidden md:flex gap-2">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-3 rounded-lg transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  title="Grid view"
                >
                  <span>▦</span>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-3 rounded-lg transition-colors ${
                    viewMode === 'list'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  title="List view"
                >
                  <span>☰</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Panel - Pill Style */}
        {showFilters && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6 space-y-6">
            {/* Care Level Filter */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Care Level
              </label>
              <div className="flex flex-wrap gap-2">
                {['beginner', 'intermediate', 'advanced'].map(level => (
                  <button
                    key={level}
                    onClick={() => toggleFilter('careLevel', level)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      filters.careLevel === level
                        ? 'bg-primary-600 text-white shadow-md transform scale-105'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <span className="mr-1">{getCareIcon(level)}</span>
                    <span className="capitalize">{level}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Type Filter */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Type
              </label>
              <div className="flex flex-wrap gap-2">
                {['terrestrial', 'arboreal', 'fossorial'].map(type => (
                  <button
                    key={type}
                    onClick={() => toggleFilter('type', type)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      filters.type === type
                        ? 'bg-primary-600 text-white shadow-md transform scale-105'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <span className="mr-1">{getTypeIcon(type)}</span>
                    <span className="capitalize">{type}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Region Filter */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Region
              </label>
              <div className="flex flex-wrap gap-2">
                {['South America', 'North America', 'Africa', 'Asia', 'Australia'].map(region => (
                  <button
                    key={region}
                    onClick={() => toggleFilter('region', region)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      filters.region === region
                        ? 'bg-primary-600 text-white shadow-md transform scale-105'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <span className="mr-1">🌍</span>
                    {region}
                  </button>
                ))}
              </div>
            </div>

            {/* Verified Only Toggle */}
            <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.verifiedOnly}
                  onChange={(e) => setFilters({ ...filters, verifiedOnly: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                <span className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <span className="mr-1">✓</span>
                  Show verified species only
                </span>
              </label>
            </div>

            {/* Active Filters Summary */}
            {(filters.careLevel || filters.type || filters.region || filters.verifiedOnly) && (
              <div className="flex items-center gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-600 dark:text-gray-400">Active filters:</span>
                <div className="flex flex-wrap gap-2">
                  {filters.careLevel && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 rounded-full text-xs">
                      {filters.careLevel}
                      <button onClick={() => setFilters({...filters, careLevel: ''})} className="hover:text-primary-600">×</button>
                    </span>
                  )}
                  {filters.type && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 rounded-full text-xs">
                      {filters.type}
                      <button onClick={() => setFilters({...filters, type: ''})} className="hover:text-primary-600">×</button>
                    </span>
                  )}
                  {filters.region && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 rounded-full text-xs">
                      {filters.region}
                      <button onClick={() => setFilters({...filters, region: ''})} className="hover:text-primary-600">×</button>
                    </span>
                  )}
                  {filters.verifiedOnly && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 rounded-full text-xs">
                      Verified only
                      <button onClick={() => setFilters({...filters, verifiedOnly: false})} className="hover:text-primary-600">×</button>
                    </span>
                  )}
                  <button
                    onClick={() => setFilters({careLevel: '', type: '', region: '', verifiedOnly: false})}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
                  >
                    Clear all
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results Count */}
        <div className="mb-4 text-gray-600 dark:text-gray-400 flex items-center justify-between">
          <span>{loading ? 'Loading...' : `${filteredSpecies.length} species found`}</span>
          {!loading && filteredSpecies.length > 0 && (
            <span className="text-sm">
              Showing {Math.min(filteredSpecies.length, 50)} of {filteredSpecies.length}
            </span>
          )}
        </div>

        {/* Species Grid/List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-primary-600"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading species database...</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredSpecies.slice(0, 50).map((s) => (
              <Link
                key={s.id}
                href={`/species/${s.id}`}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden group border border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-500"
              >
                {/* Image */}
                <div className={`relative h-48 bg-gradient-to-br ${getPlaceholderImage(s.type)}`}>
                  {s.image_url ? (
                    <img
                      src={s.image_url}
                      alt={s.scientific_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        // Fallback to placeholder if image fails to load
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-6xl opacity-50">
                      {getTypeIcon(s.type)}
                    </div>
                  )}
                  {s.is_verified && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded-full shadow-md">
                      ✓
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-1 italic line-clamp-1">
                    {s.scientific_name}
                  </h3>
                  {s.common_names && s.common_names.length > 0 && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-1">
                      {s.common_names[0]}
                    </p>
                  )}

                  {/* Fixed-width badges */}
                  <div className="flex gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <span className={`inline-flex items-center justify-center w-full text-xs font-medium px-2 py-1 rounded-full ${getCareColor(s.care_level)}`}>
                        <span className="mr-1">{getCareIcon(s.care_level)}</span>
                        <span className="truncate capitalize">{s.care_level}</span>
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="inline-flex items-center justify-center w-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-full">
                        <span className="mr-1">{getTypeIcon(s.type)}</span>
                        <span className="truncate capitalize">{s.type}</span>
                      </span>
                    </div>
                  </div>

                  {/* Only show adult size if available */}
                  {s.adult_size_cm && (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      <span className="font-medium">Adult Size:</span> ~{s.adult_size_cm} cm
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSpecies.slice(0, 50).map((s) => (
              <Link
                key={s.id}
                href={`/species/${s.id}`}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 p-4 flex gap-4 group border border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-500"
              >
                {/* Thumbnail */}
                <div className={`w-24 h-24 flex-shrink-0 rounded-lg bg-gradient-to-br ${getPlaceholderImage(s.type)} overflow-hidden`}>
                  {s.image_url ? (
                    <img
                      src={s.image_url}
                      alt={s.scientific_name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl opacity-50">
                      {getTypeIcon(s.type)}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0 pr-4">
                      <h3 className="font-semibold text-lg text-gray-900 dark:text-white italic truncate">
                        {s.scientific_name}
                      </h3>
                      {s.common_names && s.common_names.length > 0 && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                          {s.common_names.join(', ')}
                        </p>
                      )}
                    </div>
                    {s.is_verified && (
                      <span className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0">
                        ✓ Verified
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex items-center text-xs font-medium px-3 py-1 rounded-full ${getCareColor(s.care_level)}`}>
                      <span className="mr-1">{getCareIcon(s.care_level)}</span>
                      <span className="capitalize">{s.care_level}</span>
                    </span>
                    <span className="inline-flex items-center text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-full">
                      <span className="mr-1">{getTypeIcon(s.type)}</span>
                      <span className="capitalize">{s.type}</span>
                    </span>
                    {s.native_region && (
                      <span className="inline-flex items-center text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full">
                        <span className="mr-1">🌍</span>
                        {s.native_region}
                      </span>
                    )}
                    {s.adult_size_cm && (
                      <span className="inline-flex items-center text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-3 py-1 rounded-full">
                        <span className="mr-1">📏</span>
                        {s.adult_size_cm} cm
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredSpecies.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
              No species found
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Try adjusting your search or filters
            </p>
            {(filters.careLevel || filters.type || filters.region || filters.verifiedOnly) && (
              <button
                onClick={() => setFilters({careLevel: '', type: '', region: '', verifiedOnly: false})}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Showing limited results message */}
        {!loading && filteredSpecies.length > 50 && (
          <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
            Showing first 50 of {filteredSpecies.length} results. Use filters to narrow down your search.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
