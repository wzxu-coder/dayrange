import * as Sharing from "expo-sharing";
import * as LocalAuthentication from "expo-local-authentication";
import * as FileSystem from "expo-file-system";
import { Save } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import {
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";

import { Section } from "@/components/section";
import { useDayRange } from "@/data/dayrange-store";
import { GlucoseUnit, Reminder, StorageHealth } from "@/types/domain";
import { colors, radii } from "@/theme";

const STORAGE_FILE_PREFIX = "dayrange";
const DAYRANGE_BACKUP_FILE = "dayrange-backup";

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) {
    return "unknown";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export default function ProfileScreen() {
  const {
    profile,
    reminders,
    saveProfile,
    saveReminder,
    storageHealth,
    createBackup,
    previewRestore,
    restoreFromText,
    deleteAllData,
    readings,
  } = useDayRange();

  const [edits, setEdits] = useState<Partial<typeof profile>>({});
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const draft = useMemo(() => ({ ...profile, ...edits }), [profile, edits]);

  const health = useMemo<StorageHealth>(() => storageHealth ?? ({ status: "idle" } as StorageHealth), [storageHealth]);
  const storageSummary = useMemo(() => {
    const bits = health.storageUsed ?? 0;
    const quota = health.storageQuota ?? 0;
    return `${formatBytes(bits)} used ${quota ? ` / ${formatBytes(quota)}` : ""}`;
  }, [health]);

  useEffect(() => {
    async function checkBiometrics() {
      const available =
        (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      setBiometricAvailable(available);
    }
    checkBiometrics();
  }, []);

  const updateReminder = async (reminder: Reminder, enabled: boolean) => {
    try {
      await saveReminder({ ...reminder, enabled });
    } catch (error) {
      Alert.alert("Reminder not saved", error instanceof Error ? error.message : "Could not update reminder.");
    }
  };

  const save = async () => {
    await saveProfile({
      ...draft,
      targetLow: Number(draft.targetLow) || 70,
      targetHigh: Number(draft.targetHigh) || 180,
      updatedAt: new Date().toISOString(),
    });
    setEdits({});
  };

  const onExportBackup = async () => {
    try {
      const text = await createBackup();
      const fileName = `${STORAGE_FILE_PREFIX}-backup-${new Date().toISOString().slice(0, 10)}.${DAYRANGE_BACKUP_FILE}`;

      if (Platform.OS === "web") {
        const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } else {
        const file = new FileSystem.File(FileSystem.Paths.cache, fileName);
        if (file.exists) {
          file.delete();
        }
        file.write(text);
        await Sharing.shareAsync(file.uri, {
          dialogTitle: "Save DayRange backup",
          mimeType: "application/json",
        });
      }
      Alert.alert("Backup ready", "Keep this backup file where you can find it later.");
    } catch (error) {
      Alert.alert("Backup failed", error instanceof Error ? error.message : "Could not create backup.");
    }
  };

  const performRestore = async (textOverride?: string) => {
    const text = textOverride;
    if (!text) return;
    try {
      const next = await previewRestore(text);
      const countText = `${next.readingCount} readings`;
      Alert.alert("Restore backup", `This will replace your current data with ${countText}. Continue?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Replace now",
          onPress: async () => {
            try {
              await restoreFromText(text);
              Alert.alert("Restore complete", "DayRange data was replaced.");
            } catch (restoreError) {
              Alert.alert("Restore failed", restoreError instanceof Error ? restoreError.message : "Could not restore backup.");
            }
          },
        },
      ]);
    } catch (error) {
      Alert.alert("Restore failed", error instanceof Error ? error.message : "Could not read backup.");
    }
  };

  const onSelectBackupFileNative = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/json",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.length) {
      return;
    }
    const asset = result.assets[0];
    const backupText = await new FileSystem.File(asset.uri).text();
    await performRestore(backupText);
  };

  const onDeleteAll = async () => {
    Alert.alert(
      "Delete all DayRange data",
      "This cannot be undone. Create a backup first if you need a copy.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete everything",
          onPress: async () => {
            try {
              await deleteAllData();
              Alert.alert("Data removed", "Local DayRange records were deleted.");
            } catch (error) {
              Alert.alert("Delete failed", error instanceof Error ? error.message : "Could not delete data.");
            }
          },
          style: "destructive",
        },
      ]
    );
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 36 }}
      style={{ backgroundColor: colors.background }}
    >
      <Section title="Glucose Settings">
        <View style={{ gap: 12 }}>
          <Segmented
            value={draft.unit}
            options={["mg/dL", "mmol/L"]}
            onChange={(unit) => setEdits((current) => ({ ...current, unit: unit as GlucoseUnit }))}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Field
              label="Target low"
              value={String(draft.targetLow)}
              keyboardType="numeric"
              onChangeText={(value) => setEdits((current) => ({ ...current, targetLow: Number(value) }))}
            />
            <Field
              label="Target high"
              value={String(draft.targetHigh)}
              keyboardType="numeric"
              onChangeText={(value) => setEdits((current) => ({ ...current, targetHigh: Number(value) }))}
            />
          </View>
          <Text selectable style={{ color: colors.textMuted, lineHeight: 20 }}>
            Target range is user or care-team defined. DayRange uses it only to organize your log.
          </Text>
        </View>
      </Section>

      <Section title="Emergency Card">
        <View style={{ gap: 10 }}>
          <Field label="Diabetes type" value={draft.diabetesType} onChangeText={(diabetesType) => setEdits((current) => ({ ...current, diabetesType }))} />
          <Field label="Medications" value={draft.medications} onChangeText={(medications) => setEdits((current) => ({ ...current, medications }))} />
          <Field label="Allergies" value={draft.allergies} onChangeText={(allergies) => setEdits((current) => ({ ...current, allergies }))} />
          <Field label="Emergency contact" value={draft.emergencyContact} onChangeText={(emergencyContact) => setEdits((current) => ({ ...current, emergencyContact }))} />
          <Field label="Physician" value={draft.physician} onChangeText={(physician) => setEdits((current) => ({ ...current, physician }))} />
        </View>
      </Section>

      <Section title="Local Data">
        <View style={{ gap: 10 }}>
          <Text selectable style={{ color: colors.text, lineHeight: 20 }}>
            Your DayRange records are stored in this app container.
          </Text>
      <Text selectable style={{ color: colors.textMuted, lineHeight: 20 }}>
            {health.isPersistentStorage ? "Persistent storage granted" : "Persistent storage not granted"}
          </Text>
          <Text selectable style={{ color: colors.textMuted, lineHeight: 20 }}>
            {storageSummary}
          </Text>
          <Text selectable style={{ color: colors.textMuted, lineHeight: 20 }}>
            {readings.length} readings stored · Last save:
            {health.lastSuccessAt ? ` ${new Date(health.lastSuccessAt).toLocaleString()}` : " never"}
          </Text>
          <Text selectable style={{ color: colors.textMuted, lineHeight: 20 }}>
            Last state: {health.status}
          </Text>
          {health.lastSaveError ? (
            <Text selectable style={{ color: colors.accent, lineHeight: 20 }}>
              {health.lastSaveError}
            </Text>
          ) : null}
        </View>
      </Section>

      {Platform.OS !== "web" ? <Section title="Backup & Restore">
        <View style={{ gap: 10 }}>
          <Text selectable style={{ color: colors.textMuted, lineHeight: 20 }}>
            Keep one file for all your readings before changing phone.
          </Text>
          <Pressable
            onPress={onExportBackup}
            style={[buttonStyle(colors.primary), { backgroundColor: colors.primary }]}
            accessibilityRole="button"
          >
            <Text selectable style={{ color: colors.onPrimary, fontWeight: "900" }}>
              1) Save backup file
            </Text>
          </Pressable>

          <Text selectable style={{ color: colors.textMuted, lineHeight: 20 }}>
            2) On a new phone, open DayRange and tap Restore.
          </Text>

          <Pressable onPress={onSelectBackupFileNative} style={[buttonStyle(colors.surface), { borderWidth: 1, borderColor: colors.border }]}>
            <Text selectable style={{ color: colors.text, fontWeight: "900" }}>
              2) Restore from backup file
            </Text>
          </Pressable>
        </View>
      </Section> : null}

      <Section title="Privacy">
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.card,
            borderCurve: "continuous",
            borderWidth: 1,
            borderColor: colors.border,
            padding: 14,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text selectable style={{ color: colors.text, fontWeight: "800" }}>
                Biometric app lock
              </Text>
              <Text selectable style={{ color: colors.textMuted }}>
                {biometricAvailable
                  ? "Unlock this local journal with device biometrics."
                  : "No enrolled biometric lock is available on this device."}
              </Text>
            </View>
            <Switch
              disabled={!biometricAvailable}
              value={draft.biometricLockEnabled && biometricAvailable}
              onValueChange={(biometricLockEnabled) => setEdits((current) => ({ ...current, biometricLockEnabled }))}
            />
          </View>
          <Text selectable style={{ color: colors.textMuted, lineHeight: 20 }}>
            Data stays on this device. DayRange by WZXU has no account system, cloud sync, ads, or remote analytics in this MVP.
          </Text>
          <Pressable onPress={onDeleteAll} style={[buttonStyle(colors.surface), { borderColor: colors.accent, borderWidth: 1 }]}>
            <Text selectable style={{ color: colors.accent, fontWeight: "900" }}>
              Delete All DayRange Data
            </Text>
          </Pressable>
        </View>
      </Section>

      <Section title="Local Reminders">
        <View style={{ gap: 10 }}>
          {reminders.map((reminder) => (
            <View
              key={reminder.id}
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.card,
                borderCurve: "continuous",
                borderWidth: 1,
                borderColor: colors.border,
                padding: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text selectable style={{ color: colors.text, fontWeight: "800" }}>
                  {reminder.label}
                </Text>
                <Text selectable style={{ color: colors.textMuted }}>
                  {String(reminder.hour).padStart(2, "0")}:{String(reminder.minute).padStart(2, "0")} daily
                </Text>
              </View>
              <Switch value={reminder.enabled} onValueChange={(enabled) => updateReminder(reminder, enabled)} />
            </View>
          ))}
        </View>
      </Section>

      <Pressable
        accessibilityRole="button"
        onPress={save}
        style={buttonStyle(colors.primary)}
      >
        <Save color={colors.onPrimary} size={18} />
        <Text selectable style={{ color: colors.onPrimary, fontWeight: "900" }}>
          Save Profile
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function buttonStyle(backgroundColor: string) {
  return {
    minHeight: 52,
    borderRadius: 14,
    borderCurve: "continuous" as "continuous",
    backgroundColor,
    alignItems: "center" as "center",
    justifyContent: "center" as "center",
    flexDirection: "row" as "row",
    gap: 8,
    borderWidth: backgroundColor === colors.surface ? 1 : 0,
    borderColor: backgroundColor === colors.surface ? colors.border : undefined,
  } as const;
}

function fieldStyle(overrides?: { minHeight?: number }) {
  return {
    minHeight: overrides?.minHeight ?? 46,
    borderRadius: 12,
    borderCurve: "continuous" as "continuous",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.text,
  } as const;
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {options.map((option) => (
        <Pressable
          key={option}
          onPress={() => onChange(option)}
          style={{
            flex: 1,
            minHeight: 42,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: value === option ? colors.primary : colors.surface,
            borderWidth: 1,
            borderColor: value === option ? colors.primary : colors.border,
          }}
        >
          <Text selectable style={{ color: value === option ? colors.onPrimary : colors.text, fontWeight: "800" }}>
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text selectable style={{ color: colors.textMuted, fontWeight: "700" }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor={colors.textSubtle}
        style={fieldStyle()}
      />
    </View>
  );
}
