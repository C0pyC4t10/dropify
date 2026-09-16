"use client";

import { useEffect, useState } from "react";
import { riderGetJson } from "@/lib/rider-api";
import { useAuth } from "@/lib/rider-auth";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

interface AvatarState {
  url: string | null;
  initials: string;
}

export function RiderAvatar({
  riderId,
  name,
  size = 40,
}: {
  riderId: number | null;
  name: string;
  size?: number;
}) {
  const { accessToken, session } = useAuth();
  const [state, setState] = useState<AvatarState>(() => ({
    url: null,
    initials: initialsOf(name),
  }));

  // Re-fetch when the rider id changes (login → new session).
  useEffect(() => {
    let cancelled = false;
    if (!accessToken || !riderId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ url: null, initials: initialsOf(name) });
      return;
    }
    riderGetJson<{ rider: { avatarUrl: string | null } }>("/api/rider/me", accessToken)
      .then((res) => {
        if (cancelled) return;
        setState({ url: res.rider.avatarUrl, initials: initialsOf(session?.riderName ?? name) });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ url: null, initials: initialsOf(session?.riderName ?? name) });
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, riderId, name, session?.riderName]);

  const dim = size;
  if (state.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={state.url}
        alt={`${name} avatar`}
        width={dim}
        height={dim}
        style={{
          width: dim,
          height: dim,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          background: "var(--tint-brand-18)",
        }}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={{
        width: dim,
        height: dim,
        borderRadius: "50%",
        background: "var(--tint-brand-18)",
        color: "var(--color-brand)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.max(10, Math.round(dim * 0.4)),
        flexShrink: 0,
      }}
    >
      {state.initials || "?"}
    </div>
  );
}