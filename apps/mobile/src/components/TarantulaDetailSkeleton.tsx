import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import Skeleton from './Skeleton';
import { useTheme } from '../contexts/ThemeContext';

export default function TarantulaDetailSkeleton() {
  const { colors } = useTheme();
  
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Skeleton width={24} height={24} borderRadius={12} />
        <Skeleton width={100} height={20} borderRadius={4} style={styles.headerTitle} />
        <Skeleton width={24} height={24} borderRadius={12} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero Image */}
        <Skeleton width="100%" height={250} borderRadius={0} style={styles.heroImage} />

        {/* Name and Species */}
        <View style={styles.section}>
          <Skeleton width="70%" height={28} borderRadius={4} style={styles.marginBottom8} />
          <Skeleton width="90%" height={18} borderRadius={4} style={styles.marginBottom4} />
          <Skeleton width="80%" height={16} borderRadius={4} />
        </View>

        {/* Basic Info */}
        <View style={styles.section}>
          <Skeleton width={150} height={22} borderRadius={4} style={styles.marginBottom16} />
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Skeleton width={40} height={40} borderRadius={20} style={styles.marginBottom8} />
              <Skeleton width={60} height={12} borderRadius={4} style={styles.marginBottom4} />
              <Skeleton width={50} height={16} borderRadius={4} />
            </View>
            <View style={styles.infoItem}>
              <Skeleton width={40} height={40} borderRadius={20} style={styles.marginBottom8} />
              <Skeleton width={60} height={12} borderRadius={4} style={styles.marginBottom4} />
              <Skeleton width={50} height={16} borderRadius={4} />
            </View>
            <View style={styles.infoItem}>
              <Skeleton width={40} height={40} borderRadius={20} style={styles.marginBottom8} />
              <Skeleton width={60} height={12} borderRadius={4} style={styles.marginBottom4} />
              <Skeleton width={50} height={16} borderRadius={4} />
            </View>
          </View>
        </View>

        {/* Logs Section */}
        <View style={styles.section}>
          <Skeleton width={120} height={22} borderRadius={4} style={styles.marginBottom16} />
          <View style={[styles.logItem, { backgroundColor: colors.surfaceElevated }]}>
            <Skeleton width={40} height={40} borderRadius={20} style={styles.marginRight12} />
            <View style={styles.flex1}>
              <Skeleton width="80%" height={16} borderRadius={4} style={styles.marginBottom4} />
              <Skeleton width="60%" height={14} borderRadius={4} />
            </View>
          </View>
          <View style={[styles.logItem, { backgroundColor: colors.surfaceElevated }]}>
            <Skeleton width={40} height={40} borderRadius={20} style={styles.marginRight12} />
            <View style={styles.flex1}>
              <Skeleton width="70%" height={16} borderRadius={4} style={styles.marginBottom4} />
              <Skeleton width="50%" height={14} borderRadius={4} />
            </View>
          </View>
        </View>

        {/* Photos Section */}
        <View style={styles.section}>
          <Skeleton width={80} height={22} borderRadius={4} style={styles.marginBottom16} />
          <View style={styles.photoRow}>
            <Skeleton width={150} height={150} borderRadius={8} style={styles.photoThumbnail} />
            <Skeleton width={150} height={150} borderRadius={8} style={styles.photoThumbnail} />
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Action Bar */}
      <View style={[styles.actionBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <Skeleton width={100} height={48} borderRadius={12} />
        <Skeleton width={100} height={48} borderRadius={12} />
        <Skeleton width={60} height={60} borderRadius={30} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
  },
  headerTitle: {
    marginHorizontal: 16,
  },
  content: {
    flex: 1,
  },
  heroImage: {
    marginBottom: 16,
  },
  section: {
    padding: 16,
    paddingTop: 0,
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  infoItem: {
    alignItems: 'center',
  },
  logItem: {
    flexDirection: 'row',
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
  },
  photoRow: {
    flexDirection: 'row',
  },
  photoThumbnail: {
    marginRight: 12,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
  },
  marginBottom4: {
    marginBottom: 4,
  },
  marginBottom8: {
    marginBottom: 8,
  },
  marginBottom16: {
    marginBottom: 16,
  },
  marginRight12: {
    marginRight: 12,
  },
  flex1: {
    flex: 1,
  },
});
