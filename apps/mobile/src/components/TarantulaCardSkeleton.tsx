import React from 'react';
import { View, StyleSheet } from 'react-native';
import Skeleton from './Skeleton';
import { useTheme } from '../contexts/ThemeContext';

export default function TarantulaCardSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Image skeleton */}
      <Skeleton width={100} height={100} borderRadius={8} style={styles.image} />
      
      <View style={styles.content}>
        {/* Name skeleton */}
        <Skeleton width="80%" height={18} borderRadius={4} style={styles.marginBottom4} />
        
        {/* Scientific name skeleton */}
        <Skeleton width="90%" height={14} borderRadius={4} style={styles.marginBottom8} />
        
        {/* Badges row */}
        <View style={styles.badgesRow}>
          <Skeleton width={60} height={22} borderRadius={12} />
          <Skeleton width={70} height={22} borderRadius={12} />
        </View>
        
        {/* Last fed skeleton */}
        <View style={styles.lastFedRow}>
          <Skeleton width={16} height={16} borderRadius={8} />
          <Skeleton width="60%" height={12} borderRadius={4} style={styles.marginLeft8} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  image: {
    marginRight: 12,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  marginBottom4: {
    marginBottom: 4,
  },
  marginBottom8: {
    marginBottom: 8,
  },
  marginLeft8: {
    marginLeft: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  lastFedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
