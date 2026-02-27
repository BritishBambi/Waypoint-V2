import React from "react";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function Button({ label, onPress, disabled = false }: ButtonProps) {
  return (
    <button onClick={onPress} disabled={disabled}>
      {label}
    </button>
  );
}
