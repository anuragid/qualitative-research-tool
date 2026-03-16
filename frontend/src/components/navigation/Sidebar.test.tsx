import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";

// Mock Clerk's UserButton — it requires ClerkProvider which we don't have in tests
vi.mock("@clerk/react", () => ({
  UserButton: () => <div data-testid="user-button" />,
}));

// Mock useTheme so we can verify theme changes
const mockSetTheme = vi.fn();
vi.mock("../../hooks/useTheme.tsx", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    setTheme: mockSetTheme,
  }),
}));

// Mock useProjects to provide test project data
vi.mock("../../hooks/useProjects", () => ({
  useProjects: () => ({
    data: [
      { id: "p1", name: "My First Project", status: "completed" },
      { id: "p2", name: "Research Study", status: "planning" },
    ],
    isLoading: false,
  }),
}));

// Mock ModelSettingsDialog — render a testable element that shows the open prop
vi.mock("../settings/ModelSettingsDialog", () => ({
  ModelSettingsDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="model-settings-dialog">Model Settings Dialog</div> : null,
}));

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  isCollapsed: false,
  onToggleCollapse: vi.fn(),
};

function renderSidebar(props: Partial<typeof defaultProps> = {}) {
  const mergedProps = { ...defaultProps, ...props, onClose: props.onClose ?? vi.fn(), onToggleCollapse: props.onToggleCollapse ?? vi.fn() };

  const result = render(
    <MemoryRouter>
      <Sidebar {...mergedProps} />
    </MemoryRouter>
  );

  // Scope queries to the aside element to avoid duplicates from React Router v7
  const aside = result.container.querySelector(
    'aside[aria-label="Main navigation"]'
  ) as HTMLElement;

  return { ...result, onClose: mergedProps.onClose, onToggleCollapse: mergedProps.onToggleCollapse, aside };
}

describe("Sidebar", () => {
  beforeEach(() => {
    // Reset body overflow between tests (sidebar modifies it)
    document.body.style.overflow = "";
    mockSetTheme.mockReset();
    defaultProps.onClose = vi.fn();
    defaultProps.onToggleCollapse = vi.fn();
  });

  // 1. Renders methodex typemark via Logo component
  it("renders the methodex logo", () => {
    const { aside } = renderSidebar();

    const logo = aside.querySelector(
      'span[aria-label="methodex"]'
    ) as HTMLElement;
    expect(logo).not.toBeNull();
    expect(logo.textContent).toBe("methodex");
  });

  // 2. Renders "All Projects" nav link
  it('renders "All Projects" nav link', () => {
    const { aside } = renderSidebar();
    const scoped = within(aside);

    const link = scoped.getByRole("link", { name: /all projects/i });
    expect(link).toBeDefined();
  });

  // 3. "All Projects" link has href="/projects"
  it('"All Projects" link has href="/projects"', () => {
    const { aside } = renderSidebar();
    const scoped = within(aside);

    const link = scoped.getByRole("link", { name: /all projects/i });
    expect(link.getAttribute("href")).toBe("/projects");
  });

  // 4. Renders project list in sidebar
  it("renders projects from useProjects hook", () => {
    const { aside } = renderSidebar();
    const scoped = within(aside);

    expect(scoped.getByRole("link", { name: /my first project/i })).toBeDefined();
    expect(scoped.getByRole("link", { name: /research study/i })).toBeDefined();
  });

  // 5. Project links have correct hrefs
  it("project links have correct hrefs", () => {
    const { aside } = renderSidebar();
    const scoped = within(aside);

    const link1 = scoped.getByRole("link", { name: /my first project/i });
    expect(link1.getAttribute("href")).toBe("/projects/p1");

    const link2 = scoped.getByRole("link", { name: /research study/i });
    expect(link2.getAttribute("href")).toBe("/projects/p2");
  });

  // 6. Renders "Model Settings" button
  it('renders "Model Settings" button', () => {
    const { aside } = renderSidebar();
    const scoped = within(aside);

    const button = scoped.getByRole("button", { name: /model settings/i });
    expect(button).toBeDefined();
  });

  // 7. Close button is visible and calls onClose when clicked
  it("close button calls onClose when clicked", async () => {
    const user = userEvent.setup();
    const { aside, onClose } = renderSidebar();
    const scoped = within(aside);

    const closeButton = scoped.getByRole("button", {
      name: /close sidebar/i,
    });
    expect(closeButton).toBeDefined();

    await user.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // 8. Escape key calls onClose when sidebar is open
  it("Escape key calls onClose when sidebar is open", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSidebar({ isOpen: true });

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape key does NOT call onClose when sidebar is closed", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSidebar({ isOpen: false });

    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  // 9. Mobile backdrop renders and calls onClose on click
  it("mobile backdrop calls onClose on click", async () => {
    const user = userEvent.setup();
    const { container, onClose } = renderSidebar({ isOpen: true });

    // The backdrop is the div with aria-hidden="true" and bg-[var(--color-overlay)] class
    const backdrop = container.querySelector(
      'div[aria-hidden="true"]'
    ) as HTMLElement;
    expect(backdrop).not.toBeNull();

    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // 10. Sidebar has correct width class using design token
  it("sidebar aside element uses --space-sidebar-width token", () => {
    const { aside } = renderSidebar();

    expect(aside.className).toContain("--space-sidebar-width");
  });

  // 11. When isOpen=false, sidebar has -translate-x-full class
  it("has -translate-x-full class when isOpen is false", () => {
    const { aside } = renderSidebar({ isOpen: false });

    expect(aside.className).toContain("-translate-x-full");
    // Should NOT have standalone translate-x-0 (only lg: prefixed is expected)
    const classes = aside.className.split(/\s+/);
    expect(classes).not.toContain("translate-x-0");
  });

  // 12. When isOpen=true, sidebar has translate-x-0 class
  it("has translate-x-0 class when isOpen is true", () => {
    const { aside } = renderSidebar({ isOpen: true });

    expect(aside.className).toContain("translate-x-0");
    expect(aside.className).not.toContain("-translate-x-full");
  });

  // 13. Desktop collapsed state uses lg:-translate-x-full
  it("has lg:-translate-x-full class when isCollapsed is true", () => {
    const { aside } = renderSidebar({ isCollapsed: true });

    expect(aside.className).toContain("lg:-translate-x-full");
  });

  // 14. Desktop expanded state uses lg:translate-x-0
  it("has lg:translate-x-0 class when isCollapsed is false", () => {
    const { aside } = renderSidebar({ isCollapsed: false });

    expect(aside.className).toContain("lg:translate-x-0");
  });

  // 15. Theme cycle button renders with correct label
  it("renders theme cycle button with current theme label", () => {
    const { aside } = renderSidebar();
    const scoped = within(aside);

    // Mock returns theme="system", so label should be "Theme: System"
    const themeBtn = scoped.getByRole("button", { name: /theme: system/i });
    expect(themeBtn).toBeDefined();
  });

  // 16. Theme cycle button cycles to next theme on click
  it("clicking theme button cycles to next theme", async () => {
    const user = userEvent.setup();
    const { aside } = renderSidebar();
    const scoped = within(aside);

    // Mock returns theme="system", next should be "light"
    const themeBtn = scoped.getByRole("button", { name: /theme: system/i });
    await user.click(themeBtn);

    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });

  // 17. Collapse button renders on desktop and calls onToggleCollapse
  it("collapse button calls onToggleCollapse when clicked", async () => {
    const user = userEvent.setup();
    const { aside, onToggleCollapse } = renderSidebar();
    const scoped = within(aside);

    const collapseBtn = scoped.getByRole("button", { name: /collapse sidebar/i });
    await user.click(collapseBtn);

    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  // 18. Model Settings button opens the settings dialog
  it("clicking Model Settings button opens the settings dialog", async () => {
    const user = userEvent.setup();
    const { aside } = renderSidebar();
    const scoped = within(aside);

    const modelSettingsBtn = scoped.getByRole("button", { name: /model settings/i });
    await user.click(modelSettingsBtn);

    // The mocked dialog should now be visible
    expect(screen.getByTestId("model-settings-dialog")).toBeDefined();
  });

  // 19. Body overflow is set to "hidden" when sidebar is open
  it('sets body overflow to "hidden" when isOpen', () => {
    renderSidebar({ isOpen: true });
    expect(document.body.style.overflow).toBe("hidden");
  });

  // 20. Body overflow is restored when sidebar closes
  it('restores body overflow to "" when isOpen is false', () => {
    renderSidebar({ isOpen: false });
    expect(document.body.style.overflow).toBe("");
  });

  // 21. Body overflow cleanup runs on unmount
  it("restores body overflow on unmount", () => {
    const { unmount } = renderSidebar({ isOpen: true });
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
