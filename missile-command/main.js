var font_size = 50;

function setup() {
  gmath.setupLogging({ enabled: false, experiment_id: 'gm_missile_command' });
  gmath.options.actions.only_integer_devision = true;

  // this way, all derivations we create will have these options by default
  gmath.extend(gmath.Derivation.defaultOptions, {
      h_align: 'center'
    , v_align: 'center'
    , font_size: font_size
    , collapsed_mode: true
    , no_handles: true
    , show_bg: false
    , keep_in_container: false
    , draggable: false
    , debug_draw: false
    , bg_rect_active_style: { fill: 'none', stroke: 'none' }
    , bg_rect_hovering_style: { fill: 'none', stroke: 'none' }
  });

  d3.select('#start-game-btn').on('click', function() {
    d3.select('#intro-btns').remove();
    initGame();
    gmath_log_ga.trackEvent('missileCommand','clicked_play');
  });
}

function initGame() {
  var container = d3.select('#game-container');
  container.classed('game-on', true);
  game = new Game(container);
  game.start();
}

Game = function(container) {
  this.container = container;

  this.delay = 650;

  this.level = 0;
  this.level_complete = false;
  this.timer = null;
  this.num_of_destroyed_missiles = 0;
  this.tick_count = 5;

  this.missiles = [];
  this.missile_dy_on_tick = 15;

  this.canvas_container = this.container.append('div')
    .attr('id', 'canvas-container');
  var opts = {
    vertical_scroll: false
  , use_toolbar: false
  , log_mouse_trajectories: false
  , use_keyboard: false
  , use_hold_menu: false
  };
  this.canvas = new gmath.Canvas(this.canvas_container.node(), opts);
  this.canvas.callWhenReady(this.initUserExpression.bind(this));

  this.showHighScore();
}

Game.prototype.initUserExpression = function() {
  this.user_expression = this.canvas.model.createElement('derivation',
    { eq: levels[this.level].user_expression
    , pos: {x: 'center', y: 10 }}, null, this.checkSize.bind(this));

  // log whether a person interacted with the game at all
  var user_interacted_with_expression = false;
  this.user_expression.events.on('end-of-interaction', function() {
    if (!user_interacted_with_expression) {
      gmath_log_ga.trackEvent('missileCommand','user_interacted_with_expression');
      user_interacted_with_expression = true;
    }
  });

  // Emitted when the expression has finished rendering a new state.
  this.user_expression.events.on('resize.missilecommand', this.checkSize.bind(this));
}

Game.prototype.randomX = function(lmar, rmar) {
  return Math.round(Math.random()*(w-lmar-rmar))+lmar;
}

Game.prototype.updateMissilePositions = function() {
  this.missiles.forEach(missile => missile.der.translateElement({x: missile.pos[0], y: missile.pos[1]}));
}

Game.prototype.tick = function() {
  if (this.tick_count % (7+this.level) === 0){
     this.start();
  };

  this.tick_count++;
  clearTimeout(this.timer);

  if (!this.missiles) return;

  var user_ascii = this.user_expression.getLastModel().to_ascii();
  this.missiles.forEach(missile => {
    if (user_ascii === missile.ascii) {
      this.destroyMissile(missile)
    }
    else {
      missile.pos[1] += this.missile_dy_on_tick;
      if (missile.pos[1] + missile.height > 480) {
        this.lose();
      }
    }
  });
  this.missiles = this.missiles.filter(x => !x.destroyed);

  if (this.level_complete) this.levelUp();

  if (!(this.lost)) {
    this.timer = setTimeout(this.tick.bind(this), Math.round(this.delay * Math.pow(0.9, this.level)));
  }
  this.updateMissilePositions();
}

// For when the user has matched a missile expression and it should be removed.
Game.prototype.destroyMissile = function(missile) {
  this.num_of_destroyed_missiles++;

  missile.der.removeElement();
  missile.destroyed = true;

  if (this.num_of_destroyed_missiles % 10 === 0) this.level_complete = true;

  this.updateInfo();
  this.updateScore();
}

// For when the level increases.
Game.prototype.removeAllMissiles = function() {
  this.missiles.forEach(missile => missile.der.removeElement());
  this.missiles = [];
  this.updateInfo();
  this.updateScore();
}

Game.prototype.levelUp = function() {
  this.level_complete = false;
  this.level++;
  this.removeAllMissiles();
  this.user_expression.setExpression(levels[Math.min(4, this.level)].user_expression);
  this.updateInfo();
}

// Gets an ascii expression that is not the same as the current state of the user's expression.
Game.prototype.getNewMissile = function() {
  var user_ascii = this.user_expression.getLastModel().to_ascii()
    , candidate;

  // TODO: change to use new API method gmath.AlgebraModel.normalizeAscii(), once available
  while (!candidate || new gmath.AlgebraModel(candidate).to_ascii() === user_ascii) {
    candidate = Random.pick(levels[Math.min(4, this.level)].missiles);
  }

  return candidate;
}

Game.prototype.launchMissile = function() {
  var expr = this.getNewMissile();

  function on_create(der) {
    var missile = { pos: [this.randomX(mar, der.size.width+mar), mar]
                  , height: der.size.height
                  , ascii: der.getLastModel().to_ascii()
                  , der: der
                  };
    this.missiles.push(missile);
    this.updateMissilePositions(missile);
  }

  new gmath.Derivation( null, this.container.node()
                      , { eq: expr
                        , padding: { left: 0, right: 0, top: 0, bottom: 0}
                        , row_padding: { left: 0, right: 0, top: 0, bottom: 0}
                        , pos: {x:0, y:0}
                        , interactive: false
                        , inactive_color: 'black' }
                      , on_create.bind(this));
}

// Makes the green area's size fit the expression.
Game.prototype.checkSize = function() {
  var height = this.user_expression.size.height;
  this.canvas_container.style('height', height+20+'px');
}

Game.prototype.updateInfo = function() {
  d3.select('span#level').text('level: ' + this.level);
  d3.select('span#points').text(', score: ' + this.num_of_destroyed_missiles);
}

Game.prototype.updateScore = function() {
  var score = localStorage.getItem('gm-missileCommand-score');
  if (score) {
    score = JSON.parse(score);
    if (score.blocks >= this.num_of_destroyed_missiles) return;
  }
  localStorage.setItem('gm-missileCommand-score', JSON.stringify({ level: this.level,
    blocks: this.num_of_destroyed_missiles }));
  this.showHighScore();
}

Game.prototype.showHighScore = function() {
  var score = localStorage.getItem('gm-missileCommand-score');
  if (score) score = JSON.parse(score);
  else score = { level: 0, blocks: 0 };
  d3.select('span#maxlevel').text('highest level: ' + score.level);
  d3.select('span#maxpoints').text(', highest score: ' + score.blocks);
}

Game.prototype.lose = function() {
  gmath_log_ga.trackEvent('missileCommand','time',this.timer);
  gmath_log_ga.trackEvent('missileCommand','score',this.num_of_destroyed_missiles);
  clearTimeout(this.timer);
  this.lost = true;
  this.updateScore();
  this.canvas.container
    .style('background-color', 'rgba(255, 0, 0, 0.2)');
}

Game.prototype.start = function() {
  clearTimeout(this.timer);
  if (this.lost) return;
  this.updateInfo();
  this.updateScore();
  if (this.missiles.length < 5) this.launchMissile();
  this.timer = setTimeout(this.tick.bind(this), Math.round(this.delay * Math.pow(0.9, this.level)));
}

gmath_log_ga.sendPageview();
