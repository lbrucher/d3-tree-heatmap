/*
 * This code renders a heatmap with header rows on top of it.
 * It is rendered from a data structure organized as a tree of nodes.
 * Each node has a label, value(s) and a list of child nodes. Leaf nodes do not have children.
 *
 * Example:
 * A tree like this:
 *		root
 *			sector1
 *				department1
 *				department2
 *			sector2
 *				department3
 *				department4
 * would be represented like this:
 *		|                         root                          |
 *		|          sector1          |         sector2           |
 *		| department1 | department2 | department3 | department4 |
 *
 *
 *
 *
 * createTreeHeatmap() is the entry point to rendering the chart.
 * This function creates a Tree Heatmap object that will render the chart in the given domElement, starting at the given root_node and with the given options (opts)
 *
 *   root_node: each node must contain the following attributes:
 *		 label:     label displayed in the chart
 *		 values:    array of values associated with this node. Opts.value_index indicate what value to render. Index 0 by default.
 *		 children:  collection of node objects, or undefined for leaf nodes
 *
 *   opts:
 *		title:				chart title
 *		depth:				max depth to render. Heatmap will remder from root_node down up to level max_depth. depth >= 1
 *		value_index:		what index in the array of values of each node to render. Defaults to 0.
 *		unit: 				what unit to start with. One of: 'NONE', 'CURRENCY', 'PERCENT'
 *		max_cell_width:		if provided, gives a max width for a cell. Otherwise, cells extent to the entire space available.
 *		click_handler:		function(is_drill_down, hit_node), invoked when a cell has been clicked/tapped.
 *								is_drill_down=true/false whether it was a single (true) or double (false) click.
 *								hit_node=the node that was hit
 */
function createTreeHeatmap(domElement, root_node, opts) {

	var constants = null,
		chart = null;


	function initialize_constants() {

		constants = {

			units: { 'NONE':0, 'CURRENCY':1, 'PERCENT':2 },

			// margin between cells
			cell_margin: { h:3, v:2 },

			// height for each header. numbers here indicate inner height (without top/bottom margins)
			header_heights: [71, 53, 41, 41],

			// default height for leaf cells (number below is without top/bottom margins)
			default_leaf_height: 40,

			// font sizes for each header and cells
			fonts: {
				heatmap: [21, 18, 13, 13, 10],
				legend:  "13px",
			},

			// cell bg and text colors
			colors: {
				leaf_cell_bg:   ['#c5f2bc', '#78c875', '#2d9234', '#005b01', '#005b01'],
				leaf_cell_txt:  ['#383628', '#383628', '#fff',    '#fff',    '#fff'],
				header_cell_bg: ['#063256','#10527e','#1a72a5', '#1a72a5',   '#1a72a5']
			},

			// Top Y position for each header. First one starts at 0.
			header_y_pos: [],

			currency_formatter: d3.format(','),

		};

		// add top+bottom margins to each header height
		constants.header_heights = _.map(constants.header_heights, function(h) { return h+2*constants.cell_margin.v; });

		// add top+bottom margins to default cell height
		constants.default_leaf_height += 2*constants.cell_margin.v;

		constants.header_y_pos = [0];
		_.each(constants.header_heights, function(height, index) { constants.header_y_pos.push( constants.header_y_pos[index] + height ); });

		//console.log("Constants = ", constants);
	}


	function initialize(domElement, root_node, opts) {
		opts = opts || {};

		if (domElement === undefined || domElement === null)
			return;
		if (root_node === undefined || root_node === null)
			return;

		//console.log("Opts = ", opts);

		var chart_width  = $(domElement).width(),
			chart_height = $(domElement).height();

		initialize_constants();

		chart = {
			// SVG element containing the heatmap
			svg: null,

			// chart width/height
			total_width: chart_width,
			total_height: chart_height,

			// chart title
			title: opts.title || '',

			// tree to be displayed start from this node...
			root_node: root_node,

			// ... and will go as deep as the given depth
			desired_max_depth: opts.depth || 1,

			// index in the values[] array of each node
			value_index: opts.value_index || 0,

			// what unit to display
			unit: constants.units[opts.unit],

			// leaf cells can have a max width
			max_cell_width: opts.max_cell_width || chart_width,

			// hanlder when cells have been hit/clicked/touched
			click_handler: opts.click_handler,
		};


		if (chart.unit === undefined) {
			chart.unit = constants.units.CURRENCY;
		}

		// top position of the HM
		chart.top_margin = (chart.title ? 50 : 0) + 30;	// 50 for the title+bottom margin, 30 for the legend


		chart.svg = d3.select(domElement)
			.append("svg:svg")
			.attr("width",  chart.total_width)
			.attr("height", chart.total_height)
			.attr("class", "tree-heatmap");
	}



	/* ****************************************************************************
	 * Prepares whatever will be needed to render the chart.
	 * The important one is building the 'rows' array, which is essentially a matrix representation of the tree data structure
	 * and is used to actually render the heatmap
	 *
	 * ****************************************************************************/
	function prepare_chart() {

		var leaf_breath_pos = -1,
			id = 0,
			min_leaf_value = null,
			max_leaf_value = null;

		chart.rows = [];
		chart.num_max_colspan = 1;		// highest # of cols on any row
		chart.leaf_width = 0;			// width of a leaf = width of a colspan=1
		chart.leaf_height = 0;			// height of a leaf node


		function calc_colspan(node, level) {
			if (node === null || level+1 >= chart.max_depth)
				return 1;
			return _.reduce(node.children, function(n, child) { return n + calc_colspan(child, level+1); }, 0);
		}

		function node_data(node, level) {
			var is_leaf = (level === chart.max_depth);
			var o = {
					id:				id++,
					node:			node,
					empty:			node===null,
					level:			level,
					leaf:			is_leaf,
					colspan:		calc_colspan(node, level),
					value:			node===null?0:node.values[chart.value_index],
				};

			// compute min/max leaf values. This will be used to build divide the space into 4 quartiles, each with a different color (heatmap)
			if (is_leaf) {
				if (min_leaf_value === null || o.value < min_leaf_value)
					min_leaf_value = o.value;

				if (max_leaf_value === null || o.value > max_leaf_value)
					max_leaf_value = o.value;
			}

			return o;
		}


		function create_empty_leaf_row() {
			var a=[];
			_.times(chart.num_max_colspan, function(i) { a.push({empty:true, colspan:1, leaf:true}); });
			return a;
		}


		/*
		 * Tracerse the hierarchy of nodes depth first (top->bottom, left->right) and build an an array of rows.
		 * Each row correspond to a level in the hierarchy, expect for leaf nodes that each count as a row
		 * Each row is an array of cells that correspond to the nodes at level N
		 */
		function process_node(node, level) {
			var children, row_index = level;

			// add new row if needed
			if (row_index >= chart.rows.length)
				chart.rows.push([]);

			chart.rows[row_index].push( node_data(node, level) );

			// Nodes at level max_depth-1: leafs
			if (level === chart.max_depth-1) {
				row_index++;
				leaf_breath_pos++;

				children = node.children || [null];

				// we're going to push this node's children into additional rows, one child per row
				// and all children located at column 'leaf_breath_pos'
				_.each(children, function(child, index){

					// add new row if needed
					if (row_index+index >= chart.rows.length)
						chart.rows.push( create_empty_leaf_row() );

					// create our data object
					var data = node_data(child, level+1);

					chart.rows[row_index+index][leaf_breath_pos] = data;
				});
			}

			else if (node.children !== undefined) {
				_.each(node.children, function(child){ process_node(child, level+1); });
			}
		}

		// add a row_index and col_index property to each heatmap cell (rows[][]).
		function add_row_col_indexes() {
			_.each(chart.rows, function(row, row_index){
				var x=0;
				_.each(row, function(cell){
					cell.row_index = row_index;
					cell.col_index = x;
					x += cell.colspan;
				});
			});
		}


		function calc_headers_height() {
			return _.reduce(
				_.first(constants.header_heights, chart.num_headers),
				function(total, height) { return total+height; },
				0 );
		}

		function calc_leaf_height() {
			var leaf_height = (chart.total_height - chart.top_margin - chart.headers_height) / (chart.rows.length - chart.num_headers);

			return leaf_height > constants.default_leaf_height ? constants.default_leaf_height : leaf_height;
		}


		function calc_max_depth(node) {
			if (node.children === undefined)
				return 0;
			else
				return 1 + _.reduce(node.children, function(depth, child) { return Math.max(depth, calc_max_depth(child)); }, 0);
		}


		chart.max_depth = Math.min( calc_max_depth(chart.root_node), chart.desired_max_depth );

		// max number of columns
		chart.num_max_colspan = calc_colspan(chart.root_node, 0);

		// number of header rows
		chart.num_headers = chart.max_depth;

		// total height of all headers
		chart.headers_height = calc_headers_height();

		// build array of rows
		process_node(chart.root_node, 0);

		// add row and col indexes in each cell
		add_row_col_indexes();

		// width of a leaf
		chart.leaf_width = Math.min(chart.max_cell_width, chart.total_width / chart.num_max_colspan);

		// height of a leaf
		chart.leaf_height = calc_leaf_height();

		chart.show_leaf_text = (chart.leaf_height - 2*constants.cell_margin.v) >= 12;

	 	// compute legend values
	 	update_legend_values(min_leaf_value, max_leaf_value);

		//console.log("Chart = ", chart);
	}


	/* ****************************************************************************
	 * Divide the leaf cell values into quartiles that will form the 4 possible heatmap colors
	 * ****************************************************************************/
	function update_legend_values(min_value, max_value) {
		min_value = Math.min(0, min_value);
		var step = (max_value - min_value) / 4;
		chart.legend_values = [ Math.round(min_value+step), Math.round(min_value+2*step), Math.round(min_value+3*step) ];
	}


	/* ****************************************************************************
	 *
	 * ****************************************************************************/
	function build_legend() {
		var glegend,
			box_size = 14,
			box_margin=4,
			item_margin=10;


		function pc(value) {
			return d3.round(value*100/chart.root_node.values[chart.value_index], 1);
		}

		function currency(value) {
			return constants.currency_formatter(value);
		}

		function create_labels() {
			var labels, x,
				separator = '―',
				values = _.map(chart.legend_values, function(value) { return value; });

			// either use _this.legend_values or convert those in %
			if (chart.unit === constants.units.PERCENT) {
				labels = [
					'< ' + pc(values[0])+'%',
					pc(values[0])+separator+pc(chart.legend_values[1])+'%',
					pc(values[1])+separator+pc(values[2])+'%',
					'> ' + pc(values[2])+'%'
				];
			}
			else {
				labels = [
					'< ' + currency(values[0]),
					currency(values[0])+separator+currency(values[1]),
					currency(values[1])+separator+currency(values[2]),
					'> ' + currency(values[2])
				];
			}

			x = 0;
			labels = _.map(labels, function(label){
//TODO *8 sucks, need a better way to find the exact width of the label...
				var w = label.length*8,
					o = { txt:label, width:w, x:x };

				x += box_size + box_margin + w + item_margin;

				return o;
			});

			return labels;
		}



		glegend = chart.container.selectAll('g.legend'),
		glegend.remove();

		glegend = chart.container.selectAll('g.legend').data([1]);
		glegend.enter()
				.append('g')
				.attr('class', 'legend')
				.attr('transform', 'translate(6,50)');


		var glegend_item = glegend.selectAll('g.item').data( create_labels() );

		var glegitemEnter = glegend_item
			.enter()
				.append('g')
				.attr('class', 'item');

		glegitemEnter.append('rect')
			.attr("x",      function(d,i){ return d.x; } )
			.attr('y',      0)
			.attr('width',  box_size)
			.attr('height', box_size)
			.attr('fill',   function(d,i){return constants.colors.leaf_cell_bg[i];})
			.attr("rx",     3)
			.attr("ry",     3);

		glegitemEnter.append('text')
			.text( function(d) { return d.txt; } )
			.attr("font-size", constants.fonts.legend)
			.attr("fill",      '#333')
			.attr("x",         function(d,i){ return d.x+box_size + box_margin; } )
			.attr("y", 11);
	}



	/* ****************************************************************************
	 *
	 *
	 * ****************************************************************************/
	function cell_x(d) {
		return (d.col_index * chart.leaf_width)+constants.cell_margin.h;
	}

	function cell_y(d) {
		var y;
		if (!d.leaf)
			y = constants.header_y_pos[d.row_index];
		else
			y = constants.header_y_pos[chart.num_headers] + (d.row_index-chart.num_headers)*chart.leaf_height;

		return y + constants.cell_margin.v;
	}

	function cell_width(d) {
		return (d.colspan * chart.leaf_width) - 2*constants.cell_margin.h;
	}

	function cell_height(d) {
		return (!d.leaf ? constants.header_heights[d.row_index] : chart.leaf_height) - 2*constants.cell_margin.v;
	}

	function cell_class(d) {
		return d.leaf ? 'cell leaf' : 'cell';
	}

	function cell_font_size(d) {
		return !d.leaf ? constants.fonts.heatmap[d.row_index] : constants.fonts.heatmap[3];
	}

	function cell_opacity(d) {
		return d.leaf && (!chart.show_leaf_text || chart.unit === constants.units.NONE) ? 0 : 1;
	}

	function cell_value_text(d) {
		if (d.empty)
			return "";
		else if (chart.unit === constants.units.PERCENT)
			return d3.round( d.value * 100 / chart.root_node.values[chart.value_index], 1 )+'%';
		else
			return constants.currency_formatter(d3.round(d.value,0));
	}


	function cell_rect_fill(d) {
		if (d.empty) {
			return "#fff";
		}
		else if (d.leaf) {
			if (d.value < chart.legend_values[0])		return constants.colors.leaf_cell_bg[0];
			else if (d.value < chart.legend_values[1])	return constants.colors.leaf_cell_bg[1];
			else if (d.value < chart.legend_values[2])	return constants.colors.leaf_cell_bg[2];
			else 										return constants.colors.leaf_cell_bg[3];
		}
		else {
			if (d.row_index === 0)			return constants.colors.header_cell_bg[0];
			else if (d.row_index === 1)		return constants.colors.header_cell_bg[1];
			else if (d.row_index === 2)		return constants.colors.header_cell_bg[2];
			else if (d.row_index === 3)		return constants.colors.header_cell_bg[3];
		}
	}

	function cell_text_fill(d) {
		if (d.empty) {
			return "";
		}
		else if (d.leaf) {
			if (d.value < chart.legend_values[0])		return constants.colors.leaf_cell_txt[0];
			else if (d.value < chart.legend_values[1])	return constants.colors.leaf_cell_txt[1];
			else if (d.value < chart.legend_values[2])	return constants.colors.leaf_cell_txt[2];
			else 										return constants.colors.leaf_cell_txt[3];
		}
		else {
			return '#fff';
		}
	}


	function build_heatmap() {
		var clicks = 0;

		function can_drill_to(d) {
			// Allow user to click/tap on:
			// - any cell if root node is not the topmost node -> allow double click/tap anywhere on the chart
			// - cells that can be drilled down if root node is the topmost node: cells that are not empty and that have children and not the top header row
			return (chart.click_handler !== undefined &&
						(chart.root_node.parent !== null || (!d.empty && d.node.children !== undefined && d.level > 0)) );
		}

		function drill_to(is_drill_down, d3_this, drill_d) {
			// check
			if (!can_drill_to(drill_d))
				return;

			// cannot drill up when already at the top
			if (!is_drill_down && chart.root_node.parent === null)
				return;

			// cannot drill down on leaf nodes
			if (is_drill_down && (drill_d.empty || drill_d.level === 0 || drill_d.node.children === undefined))
				return;


			var gmap = chart.container.selectAll('g.chart');

			// All cells but the one we selected
			var cells = gmap.selectAll('g.cell').filter( function(d) {return d.id !== drill_d.id;})

			// progressively hide the text labels+values
			cells.selectAll('text')
				.transition()
				.duration(100)
				.attr('opacity', '0');

			// progressively shrink the cells to 0,0 width,height
			cells.selectAll('rect')
				.transition()
				.duration(200)
				.attr("x",        function(d){ return cell_x(d)+cell_width(d)/2; })
				.attr("y",        function(d){ return cell_y(d)+cell_height(d)/2; })
				.attr("width",    function(d){ return 0; })
				.attr("height",   function(d){ return 0; });

			d3.select(d3_this)
				.transition()
				.delay(50)
				.each('end', function() {
					chart.click_handler(is_drill_down, chart.root_node, drill_d.node);
				});
		}

		function click_cell_handler(d3_this, d) {
			if (++clicks === 1) {
				setTimeout( function(){
					// clicks===1 -> single click = drill down
					// otherwise  -> double click = drill up
					var down = clicks === 1;
					clicks = 0;
					drill_to(down, d3_this, d);
				}, 300);	// 300ms to distinguish between single and dbl clicks
			}
		}



		var chart_translate = {x:0, y:chart.top_margin},
			row_max_width = chart.leaf_width * chart.num_max_colspan;

		if (row_max_width < chart.total_width)
			chart_translate.x = (chart.total_width - row_max_width) / 2;

		var gmap = chart.container.selectAll('g.chart').data([1]);

		gmap.enter()
				.append('g')
				.attr('class', 'chart')
				.attr('opacity', '0')
				.attr('transform', 'translate('+chart_translate.x+','+chart_translate.y+')')
				.transition()
				 	.duration(150)
					.attr('opacity', '1.0');


		var grows = gmap.selectAll('.row').data(chart.rows);

		var growsEnter = grows.enter()
				.append('g')
				.attr('class', 'row');

		grows.exit().remove();

		var cells = growsEnter.selectAll('.cell').data(function(d){return d;});
		var gcell = cells.enter()
				.append('g')
					.attr('class', cell_class);

		// cell rect
		gcell.append('rect')
				.attr("x",        cell_x)
				.attr("y",        cell_y)
				.attr("width",    cell_width)
				.attr("height",   cell_height)
				.attr("rx",       6)
				.attr("ry",       6)
				.attr("fill",     cell_rect_fill)
				.style('cursor',  function(d) { return can_drill_to(d) ? 'pointer':'default'; })
				.on("click",      function(d) { click_cell_handler(this,d); })
				.on("touchstart", function(d) { click_cell_handler(this,d); });


		// cell label
		gcell.append('text')
				.text( function(d) { return d.empty ? '' : d.node.label_long; } )
				.attr("class",     "label")
				.attr("font-size", cell_font_size)
				.attr("opacity",   cell_opacity)
				.attr("fill",      cell_text_fill)
				.attr("x", function(d){ return cell_x(d)+6; } )
				.attr("y", function(d){ return cell_y(d)+cell_font_size(d)+1;} )
				.style('cursor',  function(d) { return can_drill_to(d) ? 'pointer':'default'; })
				.on("click",      function(d) { click_cell_handler(this,d); })
				.on("touchstart", function(d) { click_cell_handler(this,d); });


		// cell value
		gcell.append('text')
				.text( cell_value_text )
				.attr("class",       "value")
				.attr("font-size",   cell_font_size)
				.attr("fill",        cell_text_fill)
				.attr("text-anchor", "end")
				.attr("opacity",     cell_opacity)
				.attr("x", function(d){ return cell_x(d)+(chart.leaf_width*d.colspan)-12; } )
				.attr("y", function(d){ return cell_y(d) + cell_height(d) - (d.leaf ? Math.min(5, (chart.leaf_height-12)/2-1) : 5); })
				.style('cursor',  function(d) { return can_drill_to(d) ? 'pointer':'default'; })
				.on("click",      function(d) { click_cell_handler(this,d); })
				.on("touchstart", function(d) { click_cell_handler(this,d); });



		// switch from long to short label if cell is too small
		gmap.selectAll('.cell text.label')
			.text( function(d,i) {
				if (d.empty)
					return '';

				var textWidth = this.getComputedTextLength();
				var cellWidth = cell_width(d);

				return (textWidth+5 > cellWidth ? d.node.label_short : d.node.label_long);
			});


		// hide cell text if cell still too small
		gmap.selectAll('.cell text.label')
			.style("display",function(d){
				var textWidth = this.getComputedTextLength();
				var cellWidth = cell_width(d);
				d.hidden = (textWidth+5 > cellWidth);
				return d.hidden ? "none" : "";
			});

		// then hide all value labels for those cells that have their name hidden
		gmap.selectAll('.cell text.value')
			.style("display",function(d){
				if (d.hidden)
					return "none";
				var textWidth = this.getComputedTextLength();
				var cellWidth = cell_width(d);
				if (textWidth+5 > cellWidth) {
					return "none";
				}
				return "";
			});
	}


	/* ****************************************************************************
	 *
	 * ****************************************************************************/
	function build_title() {
		var gtitle;

		chart.container.selectAll('g.title').remove();

		gtitle = chart.container.selectAll('g.title').data([1]);
		gtitle.enter()
				.append('g')
				.attr('class', 'title');

		gtitle.selectAll('text')
			.data([chart.title])
			.enter()
				.append('text')
	 				.text( function(d) { return d; } )
					.attr("class","chartTitle")
					.attr('text-anchor', 'start')
					.attr('font-size',   '32px')
					.attr('font-weight', 'bold')
					.attr('fill','#000')
					.attr("x",2)
					.attr("y",30);
	}


	/* ****************************************************************************
	 *
	 * ****************************************************************************/
	function erase_chart(callback) {

		var gcontainer = chart.svg.select('g.container');

		if (gcontainer.empty()) {
			callback();
		}
		else {
			gcontainer.transition()
				.duration(150)
				.attr('opacity', '0')
				.remove()
				.each('end', function() {
					callback();
				} );
		}
	}


	/* ****************************************************************************
	 *
	 * ****************************************************************************/
	function rebuild_chart() {

		// delete existing, if any
		erase_chart( function() {

			// Add a <g> container
			chart.container = chart.svg
				.append('g')
				.attr('class', 'container')
				.attr('opacity', '1.0');

			// prep the whole thing
			prepare_chart();

			// Chart title
			build_title();

			// Legend
			build_legend();

			// Heatmap
			build_heatmap();
		});
	}



	/* ****************************************************************************
	 *
	 * ****************************************************************************/
	 function change_unit(new_unit) {
	 	if (new_unit === undefined)
	 		return;

		var gmap = chart.container.selectAll('g.chart');
		var prev_unit = chart.unit;
		chart.unit = new_unit;

		// animate show/hide labels as we transition to/from showing no labels
		if (prev_unit === constants.units.NONE || chart.unit === constants.units.NONE) {
			gmap.selectAll('.leaf text')
				.transition()
				.duration(300)
				.attr('opacity', chart.unit === constants.units.NONE ? '0':'1.0');
		}


		if (chart.unit !== constants.units.NONE) {

			var value_cells = gmap.selectAll('text.value');


			// rebuild the legend data: boundary values and labels
			build_legend();

			// if we currently have a unit displayed (that is, toggle $-%):
			if (prev_unit !== constants.units.NONE) {

				// hide current
				value_cells.transition()
						.duration(250)
						.attr('opacity', '0');

				// change text and progressively display
				value_cells.transition()
					.delay(250)
					.duration(150)
					.text(cell_value_text)
					.attr('opacity', '1.0');
			}

			// if we do not have a unit currently displayed:
			else {
				// change text
				value_cells.text(cell_value_text)

				// progressively display
				gmap.selectAll('.leaf text')
					.transition()
					.delay(50)
					.duration(300)
					.attr('opacity', '1.0');
			}
		}
	 }

	/* ****************************************************************************
	 *
	 * ****************************************************************************/
	function change_value_index(new_index) {
		var gmap = chart.container.selectAll('g.chart'),
			min_leaf_value = null,
			max_leaf_value = null;

		// set new index
		chart.value_index = new_index;

		// recalc the values, not just leafs
		gmap.selectAll('g.cell').each( function(d) {
			if (!d.empty) {
				d.value = d.node.values[chart.value_index];

				// compute min/max leaf values
				if (d.leaf) {
					if (min_leaf_value === null || d.value < min_leaf_value)
						min_leaf_value = d.value;

					if (max_leaf_value === null || d.value > max_leaf_value)
						max_leaf_value = d.value;
				}
			}
		});

		// rebuild legend values
		update_legend_values(min_leaf_value, max_leaf_value);

		// rebuild the legend data: boundary values and labels
		build_legend();

		// // update the title
		// chart.svg.select('.chartTitle')
		// 	.text( function(){ return get_current_title(); });

		// transition leaf cells background color
		gmap.selectAll('.leaf rect')
			.transition()
			.duration(300)
			.style('fill', cell_rect_fill);

		// transition leaf cells text color
		gmap.selectAll('.leaf text')
			.transition()
			.duration(300)
			.style('fill', cell_text_fill);

		// update text for all cells
		gmap.selectAll('.cell text.value')
			.transition()
			.duration(300)
			.style('fill', cell_text_fill)
			.text( cell_value_text );
	}


	 // Setup
	 initialize(domElement, root_node, opts);
	 rebuild_chart();


	// Public API
	return {
		// Set a new root node to be displayed using the current depth
		change_root_node: function(node) {
			chart.root_node = node;
			rebuild_chart();
		},

		// Change between No unit, USD or % values
		change_unit: function(n) {
			change_unit( constants.units[n] );
		},

		// change the depth of the tree to be displayed
		change_depth: function(depth) {
			chart.desired_max_depth = depth;
			if (chart.desired_max_depth < 1)
				chart.desired_max_depth = 1;

			rebuild_chart();
		},

		change_value_index: function(value_index) {
			change_value_index(value_index);
		},
	};
}
