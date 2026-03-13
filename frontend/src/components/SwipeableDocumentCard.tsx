import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RectButton, Swipeable } from "react-native-gesture-handler";
import type { DocumentListItem } from "@/api/types";
import { colors } from "@/theme/tokens";
import { DocumentCard } from "./DocumentCard";

const ACTION_WIDTH = 92;
const OPEN_THRESHOLD = 36;
const DRAG_OFFSET = 10;

type Props = {
  item: DocumentListItem;
  onPress: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onSwipeableOpen: (close: () => void) => void;
  disabled?: boolean;
};

export function SwipeableDocumentCard({
  item,
  onPress,
  onDelete,
  onTogglePin,
  onSwipeableOpen,
  disabled = false,
}: Props) {
  const swipeableRef = useRef<Swipeable | null>(null);
  const isOpenRef = useRef(false);

  const close = () => {
    swipeableRef.current?.close();
  };

  useEffect(() => () => swipeableRef.current?.close(), []);

  return (
    <Swipeable
      ref={swipeableRef}
      enabled={!disabled}
      friction={1.25}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={OPEN_THRESHOLD}
      rightThreshold={OPEN_THRESHOLD}
      dragOffsetFromLeftEdge={DRAG_OFFSET}
      dragOffsetFromRightEdge={DRAG_OFFSET}
      renderLeftActions={() => (
        <View style={styles.leftActionContainer}>
          <RectButton
            style={[styles.deleteButton, disabled && styles.actionDisabled]}
            onPress={() => {
              close();
              onDelete();
            }}
            enabled={!disabled}
          >
            <Text style={styles.deleteText}>삭제</Text>
          </RectButton>
        </View>
      )}
      renderRightActions={() => (
        <View style={styles.rightActionContainer}>
          <RectButton
            style={[styles.pinButton, disabled && styles.actionDisabled]}
            onPress={() => {
              close();
              onTogglePin();
            }}
            enabled={!disabled}
          >
            <Text style={styles.pinText}>{item.is_pinned ? "해제" : "고정"}</Text>
          </RectButton>
        </View>
      )}
      onSwipeableWillOpen={() => {
        isOpenRef.current = true;
        onSwipeableOpen(close);
      }}
      onSwipeableWillClose={() => {
        isOpenRef.current = false;
      }}
    >
      <DocumentCard
        item={item}
        onPress={() => {
          if (isOpenRef.current) {
            close();
            return;
          }
          onPress();
        }}
      />
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  leftActionContainer: {
    width: ACTION_WIDTH,
    justifyContent: "center",
  },
  rightActionContainer: {
    width: ACTION_WIDTH,
    justifyContent: "center",
  },
  deleteButton: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: "#FFE9E7",
    borderWidth: 1,
    borderColor: "#FFD5D1",
    alignItems: "center",
    justifyContent: "center",
  },
  pinButton: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: "#E7F2FF",
    borderWidth: 1,
    borderColor: "#D4E7FF",
    alignItems: "center",
    justifyContent: "center",
  },
  actionDisabled: {
    opacity: 0.5,
  },
  deleteText: {
    fontFamily: "System",
    fontWeight: "700",
    fontSize: 15,
    color: colors.error,
  },
  pinText: {
    fontFamily: "System",
    fontWeight: "700",
    fontSize: 15,
    color: colors.primary,
  },
});
