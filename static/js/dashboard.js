"use strict";

// Directives for JSHint:
/*global $:false, Rickshaw:false */

var DATA_URL = '/data/',
    SEGMENTATIONS_URL = '/segmentations',
    DEFAULT_SERIES = [ {
        name: 'Data',
        color: '#c05020',
        data: [{x:0, y:0}]
    } ];

var GRAPH_CONTAINER = '.chart';

var _reports = {
    // Report 0: median of number_sites_logged_in
    sites:
        {
            kpi: 'sites',
            tab: $('#sites'),
            graph: null,
            series: null,
            segmentation: null
        }, 
    // Report 1: total number of data points
    assertions:
        {
            kpi: 'assertions',
            tab: $('#assertions'),
            graph: null,
            series: null,
            segmentation: null
        },
    // Report 2: login flow
    flow:
        {
            kpi: 'flow',
            tab: $('#flow'),
            chart_id: '#flow-chart'
        }
};

/*** TAB SWITCHING ***/

/**
 * Switches tabs when tab button is clicked and records event in history
 */
$('[data-toggle="tab"]').click(function(e) {
    e.preventDefault();

    var target = $(e.target);

    // Is this tab already active?
    var parent = target.parent('li');
    if(parent.hasClass('active')) {
        return;
    }

    // Inactivate current tab
    parent.siblings('.active').removeClass('active');

    // Inactivate current tab contents
    var container = parent.parents('.tabbable');
    container.find('.active').removeClass('active');

    // Which report do we want activated?
    var report = target.attr('href');
        // Of the form '#report', so it already includes the ID selector

    // Activate new tab
    parent.addClass('active');

    // Activate new tab contents
    $(report).addClass('active');

    // Record event in browser history
    history.pushState({ report: report }, '', report);
});

/**
 * Activates tab when page state changes
 */
window.onpopstate = function(event) {
    var activateTab = function(report) {
        // Inactivate currently selected tab and contents
        $('.tabbable .active').removeClass('active');

        // Activate new tab
        $('[data-toggle="tab"][href="' + report + '"]').parent('li').addClass('active');

        // Activate new tab contents
        $(report).addClass('active');
    };

    if('state' in event && event.state !== null) { // Try opening tab based on state
        var report = event.state.report;
        activateTab(report);
    } else if(window.location.hash !== '') {
        // There's no state, but maybe we can get the report from the hash?
        var report = window.location.hash;
        // Does a tab with the requested ID exist?
        if($('[data-toggle="tab"][href="' + report + '"]').length > 0) { // Yes!
            activateTab(report);   
        }
    } else { // No state, no hash
        // Just show the first report in this case.
        var report = $($('[data-toggle="tab"]')[0]).attr('href');
        activateTab(report);
    }
};

window.onload = window.onpopstate;


/*** DATA RETRIEVAL ***/

/**
 * Retrieves data from server, calls callback with the data as the argument
 * @param {Object} options an object with parameters that will be sent to the server
 *     @see jQuery.getJSON
 */
function getData(kpi, options, callback) {
    var url = DATA_URL + kpi;
    $.getJSON(url, options, function(data) {
        callback(data);
    });
}


/*** DATA PROCESSING ***/

/**
 * Converts a human-readable date string into Unix time (seconds since epoch)
 * @return {Integer} number of seconds elapsed from epoch on this date
 */
function dateToTimestamp(date) {
    return Math.floor(Date.parse(date) / 1000);
}

/**
 * Converts a data object (server representation) to an array of series objects
 *     (Rickshaw representation).
 * @param data object of the form { <segment>: [ { category: '<date>', value: <value> }, ...], ... }
 * @return {Array} [ { name: '<name>', data: [ {x:<x>, y:<y>}, ...], color: '<color>' }, ...]
 */
function dataToSeries(data) {
    // Choose colors from built-in color scheme
    var palette = new Rickshaw.Color.Palette( { scheme: 'spectrum14' } );

    var series = [];
    for(var segment in data) {
        if(data.hasOwnProperty(segment)) {
            series.push({
                name: segment,
                color: palette.color(),
                data: data[segment].map(function(d) {
                    return {
                        // convert date to timestamp to take advantage of
                        // Rickshaw's built-in date handling 
                        x: dateToTimestamp(d.category),
                        y: d.value
                    };
                }).sort(function(a,b) { return a.x - b.x; }) // sort by ascending date
            });
        }
    }

    Rickshaw.Series.zeroFill(series);
    
    return series;
}

/**
 * Loads data for the report's selected segmentation from the server,
 *     converts it to series form (storing it with the report), and
 *     calls callback with no arguments when done.
 *     Uses cumulative data if segmentation is null.
 * @param {Object} report object with report's variables
 * @param {function} callback to be called when done
 */
function loadData(report, callback) {
    var options = null;
    if(report.segmentation) {
        options = { segmentation: report.segmentation };
    }

    getData(report.kpi, options, function(data) {
        report.series = dataToSeries(data);
        callback();
    });
}


/*** DATA DISPLAY ***/

/**
 * Recreates the graph using the data in series.
 * @param {Array} series the array of data in Rickshaw format
 */
function redrawGraph(report, series) {
    var container = report.tab.find(GRAPH_CONTAINER);

    // Clear out graph container
    container.html('');

    // Set up a new Rickshaw graph
    report.graph  = new Rickshaw.Graph( {
        element: container[0],
        dataURL: '/data',
        width: 650,
        height: 500,
        padding: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
        renderer: 'area',
        series: series
    });
    report.graph.render();

    // hover details
    var hoverDetail = new Rickshaw.Graph.HoverDetail( {
        graph: report.graph,
        xFormatter: function(x) {
            // Convert timestamp to date for use as the hover detail
            return (new Date(x * 1000)).toLocaleDateString();
        }
    } );

    // x axis
    var xAxis = new Rickshaw.Graph.Axis.Time({
        graph: report.graph
    });

    xAxis.render();

    // y axis
    var yAxis = new Rickshaw.Graph.Axis.Y({
        graph: report.graph
    });

    yAxis.render();

    // slider
    var slider = new Rickshaw.Graph.RangeSlider({
        graph: report.graph,
        element: report.tab.find('.slider')
    });

}

/**
 * Updates the graph with the given series.
 *     Note: the graph needs to be initialized for that to work.
 * @param {Array} an array of series objects (in Rickshaw format)
 */
function updateGraph(report, newSeries) {
    // Rickshaw extends the prototype of the series array. Copy over the extension(s).
    newSeries.active = report.graph.series.active;

    // Update the graph with the new series
    report.graph.series = newSeries;
    report.graph.update();
}

/**
 * Loads data for current segmentation and redraws graph.
 */
function loadGraph(report) {
    loadData(report, function() {
        redrawGraph(report, report.series);
        cumulativeToggled(report);
    });
}

/**
 * Loads data for current segmentation and updates graph.
 */
function reloadGraph(report) {
    loadData(report, function() {
        updateDisplayedSegments(report);
    });
}


/*** REPORT CONFIGURATION ***/

/**
 * Updates the visibility of segment checkboxes based on currently selected
 *     segmentation value.
 */
function segmentationChanged(report) {
    // Un-select current value
    if(report.segmentation) {
        report.tab.find('.segment-' + report.segmentation).hide();
    }

    // Show controls for selected value
    report.segmentation = report.tab.find('.segment-select').val();
    report.tab.find('.segment-' + report.segmentation).show();

    // Get new data and update graph.
    loadData(report, function() {
        updateDisplayedSegments(report);
    });
}

/**
 * Updates report's segmentation and the visiblity of segmentation-selection controls
 *     based on the value of the control radio button
 */
function cumulativeToggled(report) {
    var cumulative = (report.tab.find('input.segment-enabled:radio:checked').val() === 'no');

    // Toggle display of segmentation options
    report.tab.find('.segment-options').toggle(! cumulative);

    // if user wants cumulative display, segmentation is null
    report.segmentation = cumulative ? null : report.segmentation;

    if(cumulative) { // Load data and update graph
        loadData(report, function() {
            updateGraph(report, report.series);
        });
    } else {
        segmentationChanged(report);        
    }
}

/**
 * Returns an array of the selected segments for the current segmentation.
 */
function getSelectedSegments(report) {
    var segments = [];
    if(report.segmentation) {
        report.tab.find('.segment-' + report.segmentation + ' .segment-toggle:checked').each(function() {
            segments.push($(this).val());
        });
    }
    return segments;
}

/**
 * Updates which segments are displayed on the graph.
 * 
 * Since we already have data for all segments, no new data is needed;
 * we just create a series using only those segments we want and display that.
 *
 * The new series is injected into the graph, and the graph is updated.
 * (This preserves the status of the slider.)
 *
 * @return {Boolean} true if the graph was updated, false if it wasn't
 *     NOTE: The one case where the graph wouldn't be updated is if the new series is
 *     empty, i.e., the user is trying to hide all segments. However, due to a
 *     limitation of Rickshaw, at least one series must be displayed at all times.
 *     So, in this situation, we just don't update the graph.
 */
function updateDisplayedSegments(report) {
    // Create a new series with just the selected segments
    var segments = getSelectedSegments(report);
    var newSeries = report.series.filter(function(segment) {
        return segments.indexOf(segment.name) !== -1;
    });

    // Rickshaw breaks on empty series, so give it a blank one instead.
    if(newSeries.length == 0) {
        return false;
    }

    updateGraph(report, newSeries);
    return true;
}

/**
 * Creates controls on the page for all segmentations and their segments
 */
function setupSegmentControls() {
    // Load segmentations from the server
    $.getJSON(SEGMENTATIONS_URL, function(segmentations) {
        // Set up controls for the segmentations
        for(var category in segmentations) { // for each segmentation:
            if(segmentations.hasOwnProperty(category)) {
                // Create an option to turn it on
                $('.segment-select').append('<option>' + category + '</option>');

                // Create a div for checkboxes
                $('.segment-boxes').append('<ul class="segment-' + category + ' segment-box controls"></ul>');

                // Add an "other" option
                segmentations[category].push('Other');
                
                // Create a checkbox for each segment
                segmentations[category].forEach(function(segment) {
                    $('.segment-' + category).append(
                        '<li><label class="checkbox"><input class="segment-toggle" type="checkbox" checked="checked" value="' +
                        segment + '">' + segment + '</label></li>');
                });
            }
        }

        // React to toggling segments
        $('input.segment-toggle').click(function(e) {
            var report = targetReport(e.target);
            var success = updateDisplayedSegments(report);
            
            // If the update failed, leave the checkbox in its original state.
            // @see updateDisplayedSegments for why this might happen
            if(! success) {
                e.preventDefault();
            }
        });
    });
}

/**
 * Updates the graph to use the given kind of visualization.
 * @param {String} type the name of the renderer to use (e.g., 'area', 'line')
 *     accepted values are any renderers supported by Rickshaw
 */
function toggleVisualization(report, type) {
    report.graph.configure({ renderer: type });
    report.graph.update();
}

/**
 * Returns the report associated with the given target element
 * @param {Element} element DOM element, the target of an event
 * @return {Object} the report object for the pane that this element is in
 */
function targetReport(element) {
    var report = $(element).parents('.tab-pane').attr('id');
    return _reports[report];
}


/*** FLOW REPORT ***/
function makeFlowReport(report) {
    var margin = {top: 1, right: 1, bottom: 6, left: 1},
        width = 700 - margin.left - margin.right,
        height = 500 - margin.top - margin.bottom;

    var formatNumber = d3.format(",.0f"),
        format = function(d) { return formatNumber(d) + "%"; },
        color = d3.scale.category20();

    var svg = d3.select(report.chart_id).append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var sankey = d3.sankey()
        .nodeWidth(15)
        .nodePadding(10)
        .size([width, height]);

    var path = sankey.link();

    var data = {
        "nodes":
        [
            {
                "name": "Window opens"
            },
            {
                "name": "Authenticated users"
            },
            {
                "name": "Unauthenticated users"
            },
            {
                "name": "Returning users"
            },
            {
                "name": "New users"
            },
            {
                "name": "Verified passwords"
            },
            {
                "name": "Passwords created"
            },
            {
                "name": "Logged in"
            }
        ],
        "links":
        [
            // Authenticated
            {
                "source": 0,
                "target": 1,
                "value": 30
            },
            // Unauthenticated
            {
                "source": 0,
                "target": 2,
                "value": 70
            },
            // Returning, but not authenticated
            {
                "source": 2,
                "target": 3,
                "value": 30
            },
            // Not authenticated, new
            {
                "source": 2,
                "target": 4,
                "value": 37 // note that we lost a few: we never got their email, so we never found out if they're new or returning
            },
            // Returning users verifying passwords
            {
                "source": 3,
                "target": 5,
                "value": 27
            },
            // Users with verified passwords logged in
            {
                "source": 5,
                "target": 7,
                "value": 24
            },
            // Authenticated people logging in (directly)
            {
                "source": 1,
                "target": 7,
                "value": 28
            },
            // New users creating passwords = verification emails sent
            {
                "source": 4,
                "target": 6,
                "value": 32
            },
            // New users with verified emails logging in
            {
                "source": 6,
                "target": 7,
                "value": 26
            }
        ]
    };

  sankey
      .nodes(data.nodes)
      .links(data.links)
      .layout(32);

  var link = svg.append("g").selectAll(".link")
      .data(data.links)
    .enter().append("path")
      .attr("class", "link")
      .attr("d", path)
      .style("stroke-width", function(d) { return Math.max(1, d.dy); })
      .sort(function(a, b) { return b.dy - a.dy; })
      .on("dblclick", function(d) {
          console.log('Will now open the report about the drop-off from ' + d.source.name + ' to ' + d.target.name);
      });

  link.append("title")
      .text(function(d) { return d.source.name + " → " + d.target.name + "\n" + format(d.value); });

  var node = svg.append("g").selectAll(".node")
      .data(data.nodes)
    .enter().append("g")
      .attr("class", "node")
      .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; })
    .call(d3.behavior.drag()
      .origin(function(d) { return d; })
      .on("dragstart", function() { this.parentNode.appendChild(this); })
      .on("drag", dragmove));

  node.append("rect")
      .attr("height", function(d) { return d.dy; })
      .attr("width", sankey.nodeWidth())
      .style("fill", function(d) { return d.color = color(d.name.replace(/ .*/, "")); })
      .style("stroke", function(d) { return d3.rgb(d.color).darker(2); })
    .append("title")
      .text(function(d) { return d.name + "\n" + format(d.value); });

  node.append("text")
      .attr("x", -6)
      .attr("y", function(d) { return d.dy / 2; })
      .attr("dy", ".35em")
      .attr("text-anchor", "end")
      .attr("transform", null)
      .text(function(d) { return d.name; })
    .filter(function(d) { return d.x < width / 2; })
      .attr("x", 6 + sankey.nodeWidth())
      .attr("text-anchor", "start");

  function dragmove(d) {
    d3.select(this).attr("transform", "translate(" + d.x + "," + (d.y = Math.max(0, Math.min(height - d.dy, d3.event.y))) + ")");
    sankey.relayout();
    link.attr("d", path);
  }
}


/*** ON LOAD ***/

setupSegmentControls();
loadGraph(_reports.sites);
loadGraph(_reports.assertions);
makeFlowReport(_reports.flow);

$('.reload').click(function(e) {
    var report = targetReport(e.target);
    cumulativeToggled(report);
});

$('.segment-select').change(function(e) {
    var report = targetReport(e.target);
    segmentationChanged(report);
});

$('input.segment-enabled:radio').change(function(e) {
    var report = targetReport(e.target);
    cumulativeToggled(report);
});

$('input.vis-type:radio').change(function(e) {
    var report = targetReport(e.target);
    toggleVisualization(report, $(e.target).val());
});