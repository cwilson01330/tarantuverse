import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';

interface Tarantula {
  id: string;
  name: string;
  common_name: string;
  scientific_name: string;
  sex?: string;
  photo_url?: string;
}

export default function CollectionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [tarantulas, setTarantulas] = useState<Tarantula[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Helper function to handle both R2 (absolute) and local (relative) URLs
  const getImageUrl = (url?: string) => {
    if (!url) return '';
    // If URL starts with http, it's already absolute (R2)
    if (url.startsWith('http')) {
      return url;
    }
    // Otherwise, it's a local path - prepend the API base URL
    return `https://tarantuverse-api.onrender.com${url}`;
  };

  useEffect(() => {
    fetchTarantulas();
  }, []);

  const fetchTarantulas = async () => {
    try {
      const response = await apiClient.get('/tarantulas/');
      setTarantulas(response.data);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load tarantulas');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTarantulas();
    setRefreshing(false);
  }, []);

  const renderTarantula = ({ item }: { item: Tarantula }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/tarantula/${item.id}`)}
    >
      <View style={styles.imageContainer}>
        {item.photo_url ? (
          <Image source={{ uri: getImageUrl(item.photo_url) }} style={styles.image} />
        ) : (
          <View style={styles.placeholderImage}>
            <MaterialCommunityIcons name="spider" size={40} color="#d1d5db" />
          </View>
        )}
        {item.sex && (
          <View style={[styles.sexBadge, item.sex === 'female' ? styles.femaleBadge : styles.maleBadge]}>
            <MaterialCommunityIcons
              name={item.sex === 'female' ? 'gender-female' : 'gender-male'}
              size={16}
              color="#fff"
            />
          </View>
        )}
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.scientificName}>{item.scientific_name}</Text>
        {item.common_name && (
          <Text style={styles.commonName}>{item.common_name}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {tarantulas.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="spider" size={64} color="#d1d5db" />
          <Text style={styles.emptyTitle}>No Tarantulas Yet</Text>
          <Text style={styles.emptyText}>
            Start building your collection by adding your first tarantula
          </Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/add-tarantula')}
          >
            <MaterialCommunityIcons name="plus" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Add Tarantula</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={tarantulas}
            renderItem={renderTarantula}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#7c3aed']} />
            }
          />
          <TouchableOpacity
            style={styles.fab}
            onPress={() => router.push('/add-tarantula')}
          >
            <MaterialCommunityIcons name="plus" size={28} color="#fff" />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 8,
  },
  card: {
    flex: 1,
    margin: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 150,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  placeholderImage: {
    width: '100%',
    height: 150,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  sexBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  maleBadge: {
    backgroundColor: '#3b82f6',
  },
  femaleBadge: {
    backgroundColor: '#ec4899',
  },
  cardContent: {
    padding: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  scientificName: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#6b7280',
    marginBottom: 2,
  },
  commonName: {
    fontSize: 12,
    color: '#9ca3af',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#7c3aed',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7c3aed',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
