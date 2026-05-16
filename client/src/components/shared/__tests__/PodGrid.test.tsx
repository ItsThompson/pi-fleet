import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PodGrid } from "../PodGrid";

describe("PodGrid", () => {
  it("renders sections with titles and items", () => {
    const sections = [
      {
        title: "Needs Attention (2)",
        items: ["item-a", "item-b"],
        renderItem: (item: string) => <div key={item}>{item}</div>,
      },
      {
        title: "Working (1)",
        items: ["item-c"],
        renderItem: (item: string) => <div key={item}>{item}</div>,
      },
    ];

    render(
      <PodGrid
        sections={sections}
        hasActiveFilters={false}
        totalCount={3}
      />,
    );

    expect(screen.getByText("Needs Attention (2)")).toBeInTheDocument();
    expect(screen.getByText("Working (1)")).toBeInTheDocument();
    expect(screen.getByText("item-a")).toBeInTheDocument();
    expect(screen.getByText("item-b")).toBeInTheDocument();
    expect(screen.getByText("item-c")).toBeInTheDocument();
  });

  it("hides sections with no items", () => {
    const sections = [
      {
        title: "Needs Attention (0)",
        items: [] as string[],
        renderItem: (item: string) => <div key={item}>{item}</div>,
      },
      {
        title: "Working (2)",
        items: ["item-a", "item-b"],
        renderItem: (item: string) => <div key={item}>{item}</div>,
      },
    ];

    render(
      <PodGrid
        sections={sections}
        hasActiveFilters={false}
        totalCount={2}
      />,
    );

    expect(screen.queryByText("Needs Attention (0)")).not.toBeInTheDocument();
    expect(screen.getByText("Working (2)")).toBeInTheDocument();
  });

  it("shows filtered-empty message when active filters hide all items", () => {
    const sections = [
      {
        title: "Needs Attention (0)",
        items: [] as string[],
        renderItem: (item: string) => <div key={item}>{item}</div>,
      },
      {
        title: "Working (0)",
        items: [] as string[],
        renderItem: (item: string) => <div key={item}>{item}</div>,
      },
    ];

    render(
      <PodGrid
        sections={sections}
        hasActiveFilters={true}
        totalCount={5}
        filteredEmptyMessage="No pods match the active filters."
      />,
    );

    expect(screen.getByText("No pods match the active filters.")).toBeInTheDocument();
  });

  it("shows total-empty message when there are no items at all", () => {
    const sections = [
      {
        title: "Needs Attention (0)",
        items: [] as string[],
        renderItem: (item: string) => <div key={item}>{item}</div>,
      },
    ];

    render(
      <PodGrid
        sections={sections}
        hasActiveFilters={false}
        totalCount={0}
        emptyMessage="No pods in this cluster."
      />,
    );

    expect(screen.getByText("No pods in this cluster.")).toBeInTheDocument();
  });

  it("uses default empty messages when custom ones are not provided", () => {
    render(
      <PodGrid
        sections={[
          {
            title: "Section",
            items: [] as string[],
            renderItem: (item: string) => <div key={item}>{item}</div>,
          },
        ]}
        hasActiveFilters={true}
        totalCount={3}
      />,
    );

    expect(screen.getByText("No items match the active filters.")).toBeInTheDocument();
  });

  it("shows total-empty default message when totalCount is 0", () => {
    render(
      <PodGrid
        sections={[
          {
            title: "Section",
            items: [] as string[],
            renderItem: (item: string) => <div key={item}>{item}</div>,
          },
        ]}
        hasActiveFilters={false}
        totalCount={0}
      />,
    );

    expect(screen.getByText("No items to display.")).toBeInTheDocument();
  });

  it("applies responsive grid classes to item containers", () => {
    const sections = [
      {
        title: "Test Section",
        items: ["item-1"],
        renderItem: (item: string) => <div key={item}>{item}</div>,
      },
    ];

    const { container } = render(
      <PodGrid
        sections={sections}
        hasActiveFilters={false}
        totalCount={1}
      />,
    );

    const gridElement = container.querySelector(".grid");
    expect(gridElement).toHaveClass("grid-cols-1", "gap-3");
  });
});
