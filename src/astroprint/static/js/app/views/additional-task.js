var AdditionalTaskView = Backbone.View.extend({
  el: '#additional-task-view',
  additionalTaskContainerView: null,
  events: {
    'hide': 'onHide'
  },
  initialize: function(additionalTaskSequenceID)
  {
    this.additionalTaskContainerView = new AdditionalTaskContainerView(additionalTaskSequenceID);
  },
  onHide: function()
  {
    var taskAppView = this.additionalTaskContainerView.additionalTaskApp_view;
    if (taskAppView && taskAppView.customTempView) {
      taskAppView.customTempView.stopListening();
    }
  }
});

var AdditionalTaskContainerView = Backbone.View.extend({
  el: '#additional-task-app-container',
  additionalTaskApp: null,
  additionalTaskApp_view: null,
  initialize: function(additionalTaskSequenceID)
  {
    if (app.router.additionalTasksView) {
      this.additionalTaskApp = app.router.additionalTasksView.additionalTasksListView.additionalTaskCollection.findWhere({ id: additionalTaskSequenceID });
      this.render();
    } else {
      this.getSequence(additionalTaskSequenceID).then(
        success => {
          this.render();
        },
        error => {
          console.error('error', error);
          this.render();
        }
      );
    }
  },

  getSequence(additionalTaskSequenceID)
  {
    return $.getJSON(API_BASEURL + 'additional-tasks', null, _.bind(function(data) {
      if (data.utilities && data.utilities.length) {
        for (var i = 0; i < data.utilities.length; i++) {
          var ca = data.utilities[i];
          if (ca.id == additionalTaskSequenceID && ca.visibility) {
            this.additionalTaskApp = new AdditionalTask(ca);
          }
        }
      }
    }, this))
    .fail(function() {
      noty({text: "There was an error getting additional task.", timeout: 3000});
    })
  },

  render: function()
  {
    var actionEl = this.$el.find('.additional-tasks-app');
    var noActionEl = this.$el.find('#additional-task');

    actionEl.empty();
    noActionEl.hide();

    if (this.additionalTaskApp) {
      var row = new AdditionalTaskAppView({ additionalTaskApp: this.additionalTaskApp});
      actionEl.append(row.render().el);
      this.additionalTaskApp_view = row;
    } else {
      noActionEl.show();
      setTimeout(() => {
        window.location.href = window.location.origin+"/#additional-tasks"
      }, 2500);
    }
  }
});

var AdditionalTaskAppView = Backbone.View.extend({
  className: 'additional-task-row',
  additionalTaskApp: null,
  currentIndexStep: 1,
  currentStep: null,
  customTempView: null,
  events: {
    "click .close": "closeClicked",
    "click .next": "nextClicked",
    "click .action": "actionClicked",
    "click .repeat": "repeatClicked"
  },
  template: _.template($("#additional-task-app-template").html()),
  initialize: function (params)
  {
    this.additionalTaskApp = params.additionalTaskApp;
    this.currentStep = this.additionalTaskApp.get('steps')[this.currentIndexStep-1]
    this.$el.attr('id', this.additionalTaskApp.get('id'));
  },
  closeClicked: function (e)
  {
    e.preventDefault();
    this.doClose();
  },

  doClose()
  {
    window.location.href = window.location.origin+"/#additional-tasks"
  },

  currentStepManagement: function()
  {
    this.currentStep = this.additionalTaskApp.get('steps')[this.currentIndexStep-1]
    // If Show temp view
    if (this.currentStep.type == "set_temperature") {
      var loadingBtn = this.$('button.next').closest('.loading-button');
      loadingBtn.addClass('inactive');
      setTimeout( function() {
        this.customTempView = new CustomTempView();
      }.bind(this), 300);
    }
  },

  nextClicked: function (e)
  {
    e.preventDefault();
    this.doNext();
  },

  doNext()
  {
    var loadingBtn = this.$('button.next').closest('.loading-button');

    switch (this.currentStep.type) {
      case "set_extruder":
        // Change active extruder
        this._sendChangeToolCommand(this.$('#extruder-count').val())
          .done(() => {
            loadingBtn.removeClass('loading');
            this.checkNextStep();
          })
          .fail(() => {
            loadingBtn.addClass('failed');
            noty({ text: "There was an error sending a command.", timeout: 3000 });
            setTimeout(function () {
              loadingBtn.removeClass('failed');
            }, 3000);
          });
        break;
      case "set_temperature":
        this.customTempView.stopListening();
        this.checkNextStep();
        break;
      case "action":
        loadingBtn.addClass('loading');
        if (this.currentStep.commands_on_next) {
          this.sendCommands("next")
            .done(() => {
              console.info('All the commands have been sent');
              loadingBtn.removeClass('loading');
              this.checkNextStep();
            })
            .fail(() => {
              loadingBtn.addClass('failed');
              noty({ text: "There was an error sending a command.", timeout: 3000 });
              setTimeout(function () {
                loadingBtn.removeClass('failed');
              }, 3000);
            });
        } else {
          this.checkNextStep();
        }

        break;
      case "information":
        this.checkNextStep();
        break;
    }
  },

  actionClicked: function (e)
  {
    e.preventDefault();
    this.doAction();
  },

  doAction: function()
  {
    var action_commands = this.currentStep.commands_on_action;
    var isLink = false;
    if (action_commands && action_commands[0]) {
      isLink = action_commands[0].startsWith("#");
    }
    if (isLink) {
      var stepID = action_commands[0].replace('#', '');
      this.linkToStep(stepID);
    } else {
      this.sendCommands("action");
    }
  },

  linkToStep: function(stepID)
  {
    var stepToGoData = this._getStepByID(stepID);

    this.currentIndexStep = stepToGoData.index+1;
    this.currentStep = stepToGoData.step;
    this.render()
  },

  repeatClicked: function (e)
  {
    e.preventDefault();
    this.doRepeat();
  },

  doRepeat: function()
  {
    this.currentIndexStep = 1;
    this.currentStep = this.additionalTaskApp.get('steps')[this.currentIndexStep-1]
    this.render();
  },

  checkNextStep: function()
  {
    // If no Last step
    if (this.currentIndexStep < this.additionalTaskApp.get('steps').length) {
      this.currentIndexStep++;
      this.currentStep = this.additionalTaskApp.get('steps')[this.currentIndexStep-1]
      this.render();
    // If Last step
    } else {
      this.doClose();
    }
  },

  sendCommands: function(type, commandsIndex, promise)
  {
    if (!commandsIndex) {
      var commandsIndex = 0;
    }
    if (!promise) {
      var promise = $.Deferred();
    }

    var arrayCommands = type == "action" ? this.currentStep.commands_on_action : this.currentStep.commands_on_next;
     $.ajax({

      url: API_BASEURL + 'printer/comm/send',
      method: 'POST',
      data: {
        command: arrayCommands[commandsIndex]
      }
    })
      .success(( () => {
        if (arrayCommands[commandsIndex + 1]) {
          this.sendCommands(type, ++commandsIndex, promise);
        } else {
          promise.resolve();
        }
      }))

      .fail(_.bind(function () {
        promise.reject()
      }, this))

      return promise;
  },

  _sendChangeToolCommand: function(tool)
  {
    var data = {
      command: "select",
      tool: 'tool'+tool
    }

    return $.ajax({
      url: API_BASEURL + "printer/tool",
      type: "POST",
      dataType: "json",
      contentType: "application/json; charset=UTF-8",
      data: JSON.stringify(data)
    });
  },

  _getStepByID: function(ID)
  {
    var steps = this.additionalTaskApp.get('steps');
    var result = null;

    for (i = 0; i < steps.length; i++) {
      if (steps[i].id == ID) {
        result = {"step" : steps[i],"index": i};
      }
    }
    return result;
  },

  render: function ()
  {
    this.$el.empty();
    this.$el.html(this.template({currentStep: this.currentStep, currentIndexStep: this.currentIndexStep, additionalTaskApp: this.additionalTaskApp.toJSON() }));
    this.currentStepManagement();
    return this;
  },
});

var CustomTempView = Backbone.View.extend({
  className: 'control-temps small-12 columns',
  el: '#custom-temp-control-template',
  semiCircleTempView: null,
  currentExtruder: 0,
  socketTemps: null,
  initialize: function()
  {
    new SemiCircleProgress();
    var profile = app.printerProfile.toJSON();
    if (app.socketData.get('tool') >= 0) {
      this.currentExtruder = app.socketData.get('tool');
    }
    this.renderCircleTemps();
    this.listenTo(app.socketData, 'change:temps', this.onTempsChanged);
    this.listenTo(app.socketData, 'change:paused', this.onPausedChanged);
    this.listenTo(app.socketData, 'change:tool', this.onToolChanged);
  },
  renderCircleTemps: function() {
    if (app.socketData.attributes.temps != this.socketTemps) {
      this.socketTemps = app.socketData.attributes.temps;
    }
    var temps = null;

    this.$el.find('#slider-nav').empty();
    this.$el.find('#slider').empty();
    this.$el.find('.bed').empty();

    this.semiCircleTempView = new TempSemiCircleView({'tool': this.currentExtruder, enableOff: false, hideBed: true, preHeat: true});

    this.$el.find('#slider').append(this.semiCircleTempView.render().el);

    if (this.socketTemps.extruders) {
      temps = {
        current: this.socketTemps.extruders[this.currentExtruder].current,
        target: this.socketTemps.extruders[this.currentExtruder].target
      };
    } else {
      temps = {current: null, target: null};
    }


    this.semiCircleTempView.setTemps(temps.current, temps.target);

    // Draw circle
    this.$el.find("#"+this.semiCircleTempView.el.id+" .progress-temp-circle").circleProgress({
      arcCoef: 0.55,
      size: 180,
      thickness: 20,
      fill: { gradient: ['#60D2E5', '#E8A13A', '#F02E19'] }
    });
    if (this.socketTemps.extruders) {
      this.updateTemps(this.socketTemps);
    }
  },

  onTempsChanged: function(socketTempData)
  {
    var temp_values = socketTempData.get('temps');
    this.updateTemps(temp_values);
  },

  updateTemps: function(temp_values)
  {
    var temps = { 'current': temp_values.extruders[this.currentExtruder].current, 'target': temp_values.extruders[this.currentExtruder].target };

    (this.semiCircleTempView).updateValues(temps);

    if (this.semiCircleTempView.type == 'tool') {

      var tempValue = '- -';
      if (this.semiCircleTempView.actual != null) {
        tempValue = Math.round(this.semiCircleTempView.actual) + 'º';
      }
      this.$el.find("#tool"+this.currentExtruder).find('.all-temps').text(tempValue);
    }

    this.$("#"+this.semiCircleTempView.el.id+" .progress-temp-circle").circleProgress({
      arcCoef: 0.55,
      size: 180,
      thickness: 20,
      fill: { gradient: ['#60D2E5', '#E8A13A', '#F02E19'] }
    });

    if (temp_values.extruders[this.currentExtruder].current >= temp_values.extruders[this.currentExtruder].target ) {
      var loadingBtn = $('button.next').closest('.loading-button');
      loadingBtn.removeClass('inactive');
    }

  }
});
