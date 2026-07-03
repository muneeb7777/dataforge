declare module "react-plotly.js" {
  import type { Component } from "react";
  import type { Data, Layout, Config } from "plotly.js";

  interface PlotParams {
    data: Partial<Data>[];
    layout?: Partial<Layout>;
    config?: Partial<Config>;
    style?: React.CSSProperties;
    className?: string;
    useResizeHandler?: boolean;
  }

  export default class Plot extends Component<PlotParams> {}
}
