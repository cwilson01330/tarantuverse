import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

interface DateInputProps {
  value: Date;
  onChange: (date: Date) => void;
  maximumDate?: Date;
  label?: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function DateInput({ value, onChange, maximumDate, label }: DateInputProps) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [selectedYear, setSelectedYear] = useState(value.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(value.getMonth());
  const [selectedDay, setSelectedDay] = useState(value.getDate());

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => currentYear - i);

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const openPicker = () => {
    setSelectedYear(value.getFullYear());
    setSelectedMonth(value.getMonth());
    setSelectedDay(value.getDate());
    setVisible(true);
  };

  const handleConfirm = () => {
    const maxDay = getDaysInMonth(selectedYear, selectedMonth);
    const day = Math.min(selectedDay, maxDay);
    let newDate = new Date(selectedYear, selectedMonth, day);

    if (maximumDate && newDate > maximumDate) {
      newDate = maximumDate;
    }

    onChange(newDate);
    setVisible(false);
  };

  const handleMonthChange = (month: number) => {
    setSelectedMonth(month);
    const maxDay = getDaysInMonth(selectedYear, month);
    if (selectedDay > maxDay) {
      setSelectedDay(maxDay);
    }
  };

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    const maxDay = getDaysInMonth(year, selectedMonth);
    if (selectedDay > maxDay) {
      setSelectedDay(maxDay);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={openPicker}
      >
        <MaterialCommunityIcons name="calendar" size={20} color={colors.primary} />
        <Text style={[styles.buttonText, { color: colors.textPrimary }]}>
          {value.toLocaleDateString()}
        </Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: colors.surface }]}>
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Text style={[styles.headerAction, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                {label || 'Select Date'}
              </Text>
              <TouchableOpacity onPress={handleConfirm}>
                <Text style={[styles.headerAction, { color: colors.primary, fontWeight: '600' }]}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Preview */}
            <View style={styles.preview}>
              <Text style={[styles.previewText, { color: colors.primary }]}>
                {MONTHS[selectedMonth]} {selectedDay}, {selectedYear}
              </Text>
            </View>

            {/* Pickers */}
            <View style={styles.pickersRow}>
              {/* Month */}
              <View style={styles.pickerColumn}>
                <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>Month</Text>
                <ScrollView style={[styles.pickerScroll, { borderColor: colors.border }]} showsVerticalScrollIndicator={false}>
                  {MONTHS.map((month, index) => {
                    const isSelected = index === selectedMonth;
                    return (
                      <TouchableOpacity
                        key={month}
                        style={[
                          styles.pickerItem,
                          isSelected && { backgroundColor: colors.primary },
                        ]}
                        onPress={() => handleMonthChange(index)}
                      >
                        <Text style={[
                          styles.pickerItemText,
                          { color: colors.textPrimary },
                          isSelected && { color: '#fff', fontWeight: '600' },
                        ]}>
                          {month.slice(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Day */}
              <View style={styles.pickerColumn}>
                <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>Day</Text>
                <ScrollView style={[styles.pickerScroll, { borderColor: colors.border }]} showsVerticalScrollIndicator={false}>
                  {days.map((day) => {
                    const isSelected = day === selectedDay;
                    return (
                      <TouchableOpacity
                        key={day}
                        style={[
                          styles.pickerItem,
                          isSelected && { backgroundColor: colors.primary },
                        ]}
                        onPress={() => setSelectedDay(day)}
                      >
                        <Text style={[
                          styles.pickerItemText,
                          { color: colors.textPrimary },
                          isSelected && { color: '#fff', fontWeight: '600' },
                        ]}>
                          {day}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Year */}
              <View style={styles.pickerColumn}>
                <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>Year</Text>
                <ScrollView style={[styles.pickerScroll, { borderColor: colors.border }]} showsVerticalScrollIndicator={false}>
                  {years.map((year) => {
                    const isSelected = year === selectedYear;
                    return (
                      <TouchableOpacity
                        key={year}
                        style={[
                          styles.pickerItem,
                          isSelected && { backgroundColor: colors.primary },
                        ]}
                        onPress={() => handleYearChange(year)}
                      >
                        <Text style={[
                          styles.pickerItemText,
                          { color: colors.textPrimary },
                          isSelected && { color: '#fff', fontWeight: '600' },
                        ]}>
                          {year}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    gap: 8,
  },
  buttonText: {
    fontSize: 16,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerAction: {
    fontSize: 16,
  },
  preview: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  previewText: {
    fontSize: 20,
    fontWeight: '700',
  },
  pickersRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  pickerColumn: {
    flex: 1,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
    textAlign: 'center',
  },
  pickerScroll: {
    height: 200,
    borderWidth: 1,
    borderRadius: 12,
  },
  pickerItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 4,
    marginVertical: 1,
  },
  pickerItemText: {
    fontSize: 15,
  },
});
