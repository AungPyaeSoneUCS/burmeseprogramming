"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const toggle = () => {
    const h = document.documentElement;
    const next = !h.classList.contains("dark");
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    if (next.toString() === system) {
      localStorage.removeItem("theme-toggle");
    } else {
      localStorage.setItem("theme-toggle", next ? "dark" : "light");
    }
    h.classList.toggle("dark", next);
    h.dataset.theme = next ? "dark" : "light";
    h.style.colorScheme = next ? "dark" : "light";
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="btn btn-icon bg-[#00ffff]/10 text-[#00a6b8] hover:bg-[#00ffff]/25 hover:text-[#00ccd8] dark:bg-[#00ffff]/10 dark:text-[#006400] dark:hover:bg-[#00ffff]/20 dark:hover:text-[#8df3ff]"
    >
      <Sun className="w-5 h-5 dark:hidden" />
      <Moon className="w-5 h-5 hidden dark:block" />
    </button>
  );
}