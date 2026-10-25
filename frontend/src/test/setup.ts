import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Testing Library only registers its own afterEach(cleanup) when `afterEach` is a
// global, and the unit project runs with `globals` off. Without this, every tree a
// test renders stays mounted: its DOM leaks into later tests, and pending timers
// (e.g. useDebounce's) can fire after jsdom has been torn down.
afterEach(cleanup);
