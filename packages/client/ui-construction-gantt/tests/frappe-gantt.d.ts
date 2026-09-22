/**
 * Ambient declarations for the privately bundled `frappe-gantt` 1.2.2 runtime.
 *
 * This copy serves the repository Client typecheck aggregate, whose project
 * reference redirects the package's own `src/client/frappe-gantt.d.ts` away;
 * keep it identical to that file. The upstream package ships no types of its
 * own and the community `@types/frappe-gantt` targets the 0.x API, so the
 * surface actually called is pinned here: the default `Gantt` class
 * constructor, the `change_view_mode` / `refresh` methods, and the option and
 * task shapes used by the read-only adapter.
 */

declare module 'frappe-gantt' {
  /** One bar input row accepted by the 1.2.2 constructor and `refresh`. */
  export interface FrappeGanttTask {
    /** Stable task identity; the adapter passes the `ScheduleResult` task id. */
    id: string
    /** Display name rendered inside or beside the bar. */
    name: string
    /** Inclusive start date, `YYYY-MM-DD`. */
    start: string
    /** Exclusive finish boundary, `YYYY-MM-DD`. */
    end: string
    /** Completion percentage; the read-only adapter always passes 0. */
    progress: number
    /** Comma-separated predecessor ids, mapped from `ScheduleResult` links. */
    dependencies: string
    /** Extra classes added to the bar wrapper group (critical / milestone). */
    custom_class: string
  }

  /** Subset of the 1.2.2 option surface the read-only adapter sets. */
  export interface FrappeGanttOptions {
    /** Initial scale name; one of Day, Week, Month. */
    view_mode: string
    /** Hide the built-in view-mode select; the toolbar owns scale choice. */
    view_mode_select: boolean
    /** Hide the built-in Today button; fit-to-view owns scrolling. */
    today_button: boolean
    /** Disable every drag, resize, and progress interaction. */
    readonly: boolean
    /** Disable date resize handles independently of `readonly`. */
    readonly_dates: boolean
    /** Disable the progress handle independently of `readonly`. */
    readonly_progress: boolean
    /** Disable the click popup; the adapter renders details itself. */
    popup: false
    /** Keep virtual padding so initial scroll-to-start is a property write. */
    infinite_padding: boolean
    /** Bar geometry used to derive the fixed name-column row height. */
    bar_height: number
    /** Vertical space above and below each bar. */
    padding: number
    /** Upper date-header band height. */
    upper_header_height: number
    /** Lower date-header band height. */
    lower_header_height: number
    /** 'auto' lets the container height follow the drawn grid. */
    container_height: 'auto' | number
    /** Draw both grid row lines and date ticks. */
    lines: 'both' | 'vertical' | 'horizontal' | 'none'
    /** Where the initial scroll lands; 'start' scrolls to the first task. */
    scroll_to: string
    /** Draw row and tick lines. */
    readonly language?: string
  }

  /** Read-only 1.2.2 chart handle used by the adapter. */
  export default class Gantt {
    /**
     * @param wrapper - Host element (or selector) receiving the chart SVG.
     * @param tasks - Bar rows in display order.
     * @param options - Read-only option set.
     */
    constructor(wrapper: HTMLElement | string, tasks: FrappeGanttTask[], options: FrappeGanttOptions)
    /** Re-render at another scale; without `maintain_pos` the scroll resets. */
    change_view_mode(mode?: string, maintain_pos?: boolean): void
    /** Re-render with a replacement task set. */
    refresh(tasks: FrappeGanttTask[]): void
  }
}
