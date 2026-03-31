import React from 'react';
import { View, StyleSheet } from 'react-native';
import Skeleton from './Skeleton';
import { useTheme } from '../contexts/ThemeContext';

export function KeeperCardSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Avatar skeleton */}
      <Skeleton width={60} height={60} borderRadius={30} style={styles.avatar} />
      
      <View style={styles.content}>
        {/* Username skeleton */}
        <Skeleton width="70%" height={18} borderRadius={4} style={styles.marginBottom4} />
        
        {/* Location skeleton */}
        <View style={styles.locationRow}>
          <Skeleton width={14} height={14} borderRadius={7} />
          <Skeleton width="50%" height={14} borderRadius={4} style={styles.marginLeft8} />
        </View>
        
        {/* Bio skeleton */}
        <Skeleton width="100%" height={12} borderRadius={4} style={styles.marginTop8} />
        <Skeleton width="85%" height={12} borderRadius={4} style={styles.marginTop4} />
        
        {/* Badges row */}
        <View style={styles.badgesRow}>
          <Skeleton width={80} height={24} borderRadius={12} />
          <Skeleton width={70} height={24} borderRadius={12} />
        </View>
      </View>
    </View>
  );
}

export function CategoryCardSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={[styles.categoryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.categoryHeader}>
        <Skeleton width={24} height={24} borderRadius={12} style={styles.marginRight8} />
        <Skeleton width="60%" height={18} borderRadius={4} />
      </View>
      
      {/* Description skeleton */}
      <Skeleton width="100%" height={14} borderRadius={4} style={styles.marginBottom4} />
      <Skeleton width="80%" height={14} borderRadius={4} style={styles.marginBottom12} />
      
      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Skeleton width={16} height={16} borderRadius={8} />
          <Skeleton width={60} height={12} borderRadius={4} style={styles.marginLeft8} />
        </View>
        <View style={styles.statItem}>
          <Skeleton width={16} height={16} borderRadius={8} />
          <Skeleton width={50} height={12} borderRadius={4} style={styles.marginLeft8} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  avatar: {
    marginRight: 16,
  },
  content: {
    flex: 1,
  },
  marginBottom4: {
    marginBottom: 4,
  },
  marginTop4: {
    marginTop: 4,
  },
  marginTop8: {
    marginTop: 8,
  },
  marginBottom12: {
    marginBottom: 12,
  },
  marginLeft8: {
    marginLeft: 8,
  },
  marginRight8: {
    marginRight: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  categoryCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
