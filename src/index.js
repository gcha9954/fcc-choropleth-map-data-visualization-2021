import "./styles.css";
import * as d3 from "d3";
import * as topojson from "topojson-client";
import { DOM } from "@observablehq/stdlib";
import tip from "d3-tip";

// Write title to page.
d3.select("#app")
  .append("h1")
  .text("Educational Attainment in the USA")
  .attr("id", "title");

// Write description to page.
d3.select("#app")
  .append("p")
  .text("Percentage of people 25+ with bachelors or higher (2010 - 2014)")
  .attr("id", "description");

// Wait for both fetches to finish...
Promise.all([
  fetch(
    "https://cdn.freecodecamp.org/testable-projects-fcc/data/choropleth_map/for_user_education.json"
  ),
  fetch(
    "https://cdn.freecodecamp.org/testable-projects-fcc/data/choropleth_map/counties.json"
  )
])
  // ...then process responses into JSON...
  .then(function (responses) {
    return Promise.all(
      responses.map(function (response) {
        return response.json();
      })
    );
  })
  // ...then call function to draw choropleth map.
  .then(function (data) {
    drawChoropleth(data);
  })
  .catch(function (error) {
    console.log(error);
  });

function drawChoropleth(data) {
  // Education data
  const ed = data[0];

  // Topology data
  const us = data[1];

  // Draw base SVG
  const svg = d3
    .select("#app")
    .append("svg")
    .attr("width", "100%")
    .attr("viewBox", [0, 0, 975, 610]);

  // New geographic path generator with default settings
  const path = d3.geoPath();

  // Generate color scheme
  const maxEd = Math.round(d3.max(ed, (d) => d.bachelorsOrHigher));
  const minEd = Math.round(d3.min(ed, (d) => d.bachelorsOrHigher));
  const color = d3.scaleQuantize([minEd, maxEd], d3.schemeGreens[9]);

  // Create a map of county ID (fips) to % Bachelors or higher
  const dataMap = Object.assign(
    new Map(ed.map((d) => [d.fips, d.bachelorsOrHigher])),
    { title: "Unemployment rate (%)" }
  );

  // Create a map of county ID (fips) to state and county name
  const countyMap = Object.assign(
    new Map(ed.map((d) => [d.fips, `${d.area_name}, ${d.state}`])),
    { title: "Unemployment rate (%)" }
  );

  // Initialise tooltip
  let tooltip = tip()
    .html(function (event, data) {
      return `${countyMap.get(data.id)}: ${dataMap.get(data.id)}%`;
    })
    .attr("class", "d3-tip")
    .attr("id", "tooltip");
  svg.call(tooltip);

  // Create legend
  svg
    .append("g")
    .attr("transform", "translate(610,20)")
    .append(() => legend({ color, title: data.title, width: 260 }))
    .attr("id", "legend");

  // Draw county data
  svg
    .append("g")
    .selectAll("path")
    .data(topojson.feature(us, us.objects.counties).features)
    .join("path")
    .attr("fill", (d) => color(dataMap.get(d.id)))
    .attr("d", path)
    .attr("class", "county")
    .attr("data-fips", (d) => d.id)
    .attr("data-education", (d) => dataMap.get(d.id))
    // Tootlip on mouseover
    .on("mouseover", tooltip.show)
    .on("mousemove", (event, data) => {
      tooltip.attr("data-education", dataMap.get(data.id));
    })
    .on("mouseout", tooltip.hide);

  // Draw state outlines
  svg
    .append("path")
    .datum(topojson.mesh(us, us.objects.states, (a, b) => a !== b))
    .attr("fill", "none")
    .attr("stroke", "white")
    .attr("stroke-linejoin", "round")
    .attr("d", path);

  // Legend function from https://observablehq.com/@d3/color-legend
  function legend({
    color,
    title,
    tickSize = 6,
    width = 320,
    height = 44 + tickSize,
    marginTop = 18,
    marginRight = 0,
    marginBottom = 16 + tickSize,
    marginLeft = 0,
    ticks = width / 64,
    tickFormat,
    tickValues
  } = {}) {
    const svg = d3
      .create("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .style("overflow", "visible")
      .style("display", "block");

    let tickAdjust = (g) =>
      g.selectAll(".tick line").attr("y1", marginTop + marginBottom - height);
    let x;

    // Continuous
    if (color.interpolate) {
      const n = Math.min(color.domain().length, color.range().length);

      x = color
        .copy()
        .rangeRound(
          d3.quantize(d3.interpolate(marginLeft, width - marginRight), n)
        );

      svg
        .append("image")
        .attr("x", marginLeft)
        .attr("y", marginTop)
        .attr("width", width - marginLeft - marginRight)
        .attr("height", height - marginTop - marginBottom)
        .attr("preserveAspectRatio", "none")
        .attr(
          "xlink:href",
          ramp(
            color.copy().domain(d3.quantize(d3.interpolate(0, 1), n))
          ).toDataURL()
        );
    }

    // Sequential
    else if (color.interpolator) {
      x = Object.assign(
        color
          .copy()
          .interpolator(d3.interpolateRound(marginLeft, width - marginRight)),
        {
          range() {
            return [marginLeft, width - marginRight];
          }
        }
      );

      svg
        .append("image")
        .attr("x", marginLeft)
        .attr("y", marginTop)
        .attr("width", width - marginLeft - marginRight)
        .attr("height", height - marginTop - marginBottom)
        .attr("preserveAspectRatio", "none")
        .attr("xlink:href", ramp(color.interpolator()).toDataURL());

      // scaleSequentialQuantile doesn’t implement ticks or tickFormat.
      if (!x.ticks) {
        if (tickValues === undefined) {
          const n = Math.round(ticks + 1);
          tickValues = d3
            .range(n)
            .map((i) => d3.quantile(color.domain(), i / (n - 1)));
        }
        if (typeof tickFormat !== "function") {
          tickFormat = d3.format(tickFormat === undefined ? ",f" : tickFormat);
        }
      }
    }

    // Threshold
    else if (color.invertExtent) {
      const thresholds = color.thresholds
        ? color.thresholds() // scaleQuantize
        : color.quantiles
        ? color.quantiles() // scaleQuantile
        : color.domain(); // scaleThreshold

      const thresholdFormat =
        tickFormat === undefined
          ? (d) => d
          : typeof tickFormat === "string"
          ? d3.format(tickFormat)
          : tickFormat;

      x = d3
        .scaleLinear()
        .domain([-1, color.range().length - 1])
        .rangeRound([marginLeft, width - marginRight]);

      svg
        .append("g")
        .selectAll("rect")
        .data(color.range())
        .join("rect")
        .attr("x", (d, i) => x(i - 1))
        .attr("y", marginTop)
        .attr("width", (d, i) => x(i) - x(i - 1))
        .attr("height", height - marginTop - marginBottom)
        .attr("fill", (d) => d);

      tickValues = d3.range(thresholds.length);
      tickFormat = (i) => thresholdFormat(thresholds[i], i);
    }

    // Ordinal
    else {
      x = d3
        .scaleBand()
        .domain(color.domain())
        .rangeRound([marginLeft, width - marginRight]);

      svg
        .append("g")
        .selectAll("rect")
        .data(color.domain())
        .join("rect")
        .attr("x", x)
        .attr("y", marginTop)
        .attr("width", Math.max(0, x.bandwidth() - 1))
        .attr("height", height - marginTop - marginBottom)
        .attr("fill", color);

      tickAdjust = () => {};
    }

    svg
      .append("g")
      .attr("transform", `translate(0,${height - marginBottom})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(ticks, typeof tickFormat === "string" ? tickFormat : undefined)
          .tickFormat(typeof tickFormat === "function" ? tickFormat : undefined)
          .tickSize(tickSize)
          .tickValues(tickValues)
      )
      .call(tickAdjust)
      .call((g) => g.select(".domain").remove())
      .call((g) =>
        g
          .append("text")
          .attr("x", marginLeft)
          .attr("y", marginTop + marginBottom - height - 6)
          .attr("fill", "currentColor")
          .attr("text-anchor", "start")
          .attr("font-weight", "bold")
          .attr("class", "title")
          .text(title)
      );

    return svg.node();
  }

  // Ramp function from https://observablehq.com/@d3/color-legend
  function ramp(color, n = 256) {
    const canvas = DOM.canvas(n, 1);
    const context = canvas.getContext("2d");
    for (let i = 0; i < n; ++i) {
      context.fillStyle = color(i / (n - 1));
      context.fillRect(i, 0, 1, 1);
    }
    return canvas;
  }
}
