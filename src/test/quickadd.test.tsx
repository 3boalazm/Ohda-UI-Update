import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuickAdd } from "@/components/QuickAdd";
import { emptyPlan } from "@/lib/plan";

function setup() {
  const onAdd = vi.fn();
  const onOpenSection = vi.fn();
  render(
    <div style={{ position: "relative" }}>
      <button>before</button>
      <QuickAdd plan={emptyPlan()} onAdd={onAdd} onOpenSection={onOpenSection} />
      <button>after</button>
    </div>,
  );
  const fab = screen.getByRole("button", { name: "ضيف حاجة جديدة" });
  const dialog = () => screen.getByRole("dialog", { hidden: true });
  const tab = (shiftKey = false) =>
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Tab", shiftKey });
  return { fab, dialog, tab, onAdd, onOpenSection };
}

describe("QuickAdd as a modal dialog", () => {
  it("moves focus into the dialog and keeps Tab and Shift+Tab inside it", async () => {
    const { fab, dialog, tab } = setup();
    fab.focus();
    fireEvent.click(fab);
    await waitFor(() => expect(dialog().contains(document.activeElement)).toBe(true));

    for (let i = 0; i < 20; i++) {
      tab();
      expect(dialog().contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 20; i++) {
      tab(true);
      expect(dialog().contains(document.activeElement)).toBe(true);
    }
  });

  it("pulls focus back in if it somehow sits behind the dialog", async () => {
    const { fab, dialog, tab } = setup();
    fireEvent.click(fab);
    await waitFor(() => expect(dialog().contains(document.activeElement)).toBe(true));
    screen.getByRole("button", { name: "after" }).focus();
    tab();
    expect(dialog().contains(document.activeElement)).toBe(true);
  });

  it("returns focus to the + button on Escape", async () => {
    const { fab, dialog } = setup();
    fireEvent.click(fab);
    await waitFor(() => expect(dialog().contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(fab));
  });

  it("adds one thing, closes, and returns focus to the + button", async () => {
    const { fab, dialog, onAdd } = setup();
    fireEvent.click(fab);
    await waitFor(() => expect(dialog().contains(document.activeElement)).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: /^بنك/ }));
    const input = await screen.findByLabelText(/^الاسم/);
    fireEvent.change(input, { target: { value: "الراجحي" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ضيف" }));
    });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]![1]).toBe("الراجحي");
    await waitFor(() => expect(document.activeElement).toBe(fab));
  });
});
