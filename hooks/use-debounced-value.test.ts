import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// React does not pick up setState calls made inside a fake-timer
// callback (fired through vi.advanceTimersByTime) unless the advance
// itself runs inside act(). Without act(), the update happens but
// never flushes to `result.current` before the assertion runs.
describe("useDebouncedValue", () => {
  it("returns the initial value immediately, before any delay elapses", () => {
    const { result } = renderHook(() => useDebouncedValue("a", 700));
    expect(result.current).toBe("a");
  });

  it("does not update until the full delay has elapsed with no further changes", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 700), {
      initialProps: { value: "a" },
    });

    rerender({ value: "ab" });
    act(() => vi.advanceTimersByTime(699));
    expect(result.current).toBe("a");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("ab");
  });

  it("resets the window on every change — a change 1ms before the deadline restarts the full delay", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 700), {
      initialProps: { value: "a" },
    });

    rerender({ value: "ab" });
    act(() => vi.advanceTimersByTime(699)); // one tick short of committing "ab"
    rerender({ value: "abc" }); // typing again resets the window
    act(() => vi.advanceTimersByTime(699));
    expect(result.current).toBe("a"); // still not committed — reset worked

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("abc"); // commits the latest value, not "ab"
  });
});
