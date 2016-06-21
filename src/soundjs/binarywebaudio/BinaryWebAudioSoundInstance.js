/**
 * @module SoundJS
 */

// namespace:
this.createjs = this.createjs || {};

(function () {
    "use strict";

    function BinaryWebAudioSoundInstance(src, startTime, duration, playbackResource) {
        this.AbstractSoundInstance_constructor(src, startTime, duration, playbackResource);

// public properties
        /**
         * NOTE this is only intended for use by advanced users.
         * <br />GainNode for controlling <code>WebAudioSoundInstance</code> volume. Connected to the {{#crossLink "WebAudioSoundInstance/destinationNode:property"}}{{/crossLink}}.
         * @property gainNode
         * @type {AudioGainNode}
         * @since 0.4.0
         *
         */
        this.gainNode = s.context.createGain();

        /**
         * NOTE this is only intended for use by advanced users.
         * <br />A panNode allowing left and right audio channel panning only. Connected to WebAudioSoundInstance {{#crossLink "WebAudioSoundInstance/gainNode:property"}}{{/crossLink}}.
         * @property panNode
         * @type {AudioPannerNode}
         * @since 0.4.0
         */
        this.panNode = s.context.createPanner();
        this.panNode.panningModel = s._panningModel;
        this.panNode.connect(this.gainNode);
        this._updatePan();

        /**
         * NOTE this is only intended for use by advanced users.
         * <br />sourceNode is the audio source. Connected to WebAudioSoundInstance {{#crossLink "WebAudioSoundInstance/panNode:property"}}{{/crossLink}}.
         * @property sourceNode
         * @type {AudioNode}
         * @since 0.4.0
         *
         */
        this.sourceNode = null;


// private properties
        /**
         * Timeout that is created internally to handle sound playing to completion.
         * Stored so we can remove it when stop, pause, or cleanup are called
         * @property _soundCompleteTimeout
         * @type {timeoutVariable}
         * @default null
         * @protected
         * @since 0.4.0
         */
        this._soundCompleteTimeout = null;

        /**
         * NOTE this is only intended for use by very advanced users.
         * _sourceNodeNext is the audio source for the next loop, inserted in a look ahead approach to allow for smooth
         * looping. Connected to {{#crossLink "WebAudioSoundInstance/gainNode:property"}}{{/crossLink}}.
         * @property _sourceNodeNext
         * @type {AudioNode}
         * @default null
         * @protected
         * @since 0.4.1
         *
         */
        this._sourceNodeNext = null;

        /**
         * Time audio started playback, in seconds. Used to handle set position, get position, and resuming from paused.
         * @property _playbackStartTime
         * @type {Number}
         * @default 0
         * @protected
         * @since 0.4.0
         */
        this._playbackStartTime = 0;

        // Proxies, make removing listeners easier.
        this._endedHandler = createjs.proxy(this._handleSoundComplete, this);
    }
    var p = createjs.extend(BinaryWebAudioSoundInstance, createjs.WebAudioSoundInstance);
    var s = BinaryWebAudioSoundInstance;


    /**
     * Note this is only intended for use by advanced users.
     * <br />Audio context used to create nodes.  This is and needs to be the same context used by {{#crossLink "WebAudioPlugin"}}{{/crossLink}}.
     * @property context
     * @type {AudioContext}
     * @static
     * @since 0.6.0
     */
    s.context = null;

    /**
     * Note this is only intended for use by advanced users.
     * <br />The scratch buffer that will be assigned to the buffer property of a source node on close.
     * This is and should be the same scratch buffer referenced by {{#crossLink "WebAudioPlugin"}}{{/crossLink}}.
     * @property _scratchBuffer
     * @type {AudioBufferSourceNode}
     * @static
     */
    s._scratchBuffer = null;

    /**
     * Note this is only intended for use by advanced users.
     * <br /> Audio node from WebAudioPlugin that sequences to <code>context.destination</code>
     * @property destinationNode
     * @type {AudioNode}
     * @static
     * @since 0.6.0
     */
    s.destinationNode = null;

    /**
     * Value to set panning model to equal power for WebAudioSoundInstance.  Can be "equalpower" or 0 depending on browser implementation.
     * @property _panningModel
     * @type {Number / String}
     * @protected
     * @static
     * @since 0.6.0
     */
    s._panningModel = "equalpower";


    /**
     * https://github.com/audio-lab/is-audio-buffer/blob/master/index.js
     * @param buffer
     * @returns {boolean}
     * @private
     */
    s._isAudioBuffer = function (buffer) {
        //the guess is duck-typing
        return buffer != null
            && buffer.sampleRate != null //swims like AudioBuffer
            && typeof buffer.getChannelData === 'function'; //quacks like AudioBuffer
    };


// Public methods
    p.destroy = function() {
        this.AbstractSoundInstance_destroy();

        this.panNode.disconnect(0);
        this.panNode = null;
        this.gainNode.disconnect(0);
        this.gainNode = null;
    };

    p.toString = function () {
        return "[BinaryWebAudioSoundInstance]";
    };


// Private Methods
    p._updatePan = function() {
        this.panNode.setPosition(this._pan, 0, -0.5);
        // z need to be -0.5 otherwise the sound only plays in left, right, or center
    };

    p._removeLooping = function(value) {
        this._sourceNodeNext = this._cleanUpAudioNode(this._sourceNodeNext);
    };

    p._addLooping = function(value) {
        if (this.playState != createjs.Sound.PLAY_SUCCEEDED) { return; }
        this._sourceNodeNext = this._createAndPlayAudioNode(this._playbackStartTime, 0);
    };

    p._setDurationFromSource = function () {
        this._duration = this.playbackResource.duration * 1000;
    };

    p._handleDecodedDataCleanup = function() {
        // Drop the decoded data if it was decoded, but only if we were playing the full file. If we're playing a sound
        // segment, leave that audio decoded to avoid overhead
        //if (this.originalResource && this._duration == this.playbackResource.duration) {
        //    this.playbackResource = this.originalResource;
        //    this.originalResource = null;
        //}

        if (this.originalResource) {
            this.playbackResource = this.originalResource;
            this.originalResource = null;
        }
    };

    p._handleCleanUp = function () {
        if (this.sourceNode && this.playState == createjs.Sound.PLAY_SUCCEEDED) {
            this.sourceNode = this._cleanUpAudioNode(this.sourceNode);
            this._sourceNodeNext = this._cleanUpAudioNode(this._sourceNodeNext);
        }

        if (this.gainNode.numberOfOutputs != 0) {this.gainNode.disconnect(0);}
        // OJR there appears to be a bug that this doesn't always work in webkit (Chrome and Safari). According to the documentation, this should work.

        clearTimeout(this._soundCompleteTimeout);

        this._handleDecodedDataCleanup();

        this._playbackStartTime = 0;	// This is used by getPosition
    };

    /**
     * Turn off and disconnect an audioNode, then set reference to null to release it for garbage collection
     * @method _cleanUpAudioNode
     * @param audioNode
     * @return {audioNode}
     * @protected
     * @since 0.4.1
     */
    p._cleanUpAudioNode = function(audioNode) {
        if(audioNode) {
            audioNode.stop(0);
            audioNode.disconnect(0);
            // necessary to prevent leak on iOS Safari 7-9. will throw in almost all other
            // browser implementations.
            try { audioNode.buffer = s._scratchBuffer; } catch(e) {}
            audioNode = null;
        }
        return audioNode;
    };

    /**
     * Called by the Sound class when the audio is ready to play (delay has completed). Starts sound playing if the
     * src is loaded, otherwise playback will fail.
     * @method _beginPlaying
     * @param {PlayPropsConfig} playProps A PlayPropsConfig object.
     * @return {Boolean} If playback succeeded.
     * @protected
     */
        // OJR FlashAudioSoundInstance overwrites
    p._beginPlaying = function (playProps) {
        this.setPosition(playProps.offset);
        this.setLoop(playProps.loop);
        this.setVolume(playProps.volume);
        this.setPan(playProps.pan);
        if (playProps.startTime != null) {
            this.setStartTime(playProps.startTime);
            this.setDuration(playProps.duration);
        }

        //if (this._playbackResource != null && this._position < this._duration) { // we haven't decoded yet, don't know the duration
        if (this._playbackResource != null) {
            this._paused = false;
            this._handleSoundReady();
            this.playState = createjs.Sound.PLAY_SUCCEEDED;
            this._sendEvent("succeeded");
            return true;
        } else {
            this._playFailed();
            return false;
        }
    };

    p._handleAudioDecode = function (data) {
        //data props: {length: 7771439, duration: 176.22310657596373, sampleRate: 44100, numberOfChannels: 1

        // Save the existing so we can drop the decoded and restore the encoded.
        this.originalResource = this.playbackResource;

        this.playbackResource = data;

        // Don't override a segment audio duration if this was created with one
        if (!this._duration) {
            this._setDurationFromSource();
        }

        this._handleSoundDecoded();
    };

    p._handleSoundDecoded = function () {
        this.gainNode.connect(s.destinationNode);  // this line can cause a memory leak.  Nodes need to be disconnected from the audioDestination or any sequence that leads to it.

        var dur = this._duration * 0.001;
        var pos = this._position * 0.001;
        if (pos > dur) {pos = dur;}
        this.sourceNode = this._createAndPlayAudioNode((s.context.currentTime - dur), pos);
        this._playbackStartTime = this.sourceNode.startTime - pos;

        this._soundCompleteTimeout = setTimeout(this._endedHandler, (dur - pos) * 1000);

        if(this._loop != 0) {
            this._sourceNodeNext = this._createAndPlayAudioNode(this._playbackStartTime, 0);
        }
    };

    p._handleSoundReady = function (event) {
        if (this.originalResource) { //we've already decoded
            this._handleSoundDecoded();
        } else {
            s.context.decodeAudioData(this.playbackResource,
                createjs.proxy(this._handleAudioDecode, this),
                createjs.proxy(this._sendError, this));
        }
    };

    /**
     * Creates an audio node using the current src and context, connects it to the gain node, and starts playback.
     * @method _createAndPlayAudioNode
     * @param {Number} startTime The time to add this to the web audio context, in seconds.
     * @param {Number} offset The amount of time into the src audio to start playback, in seconds.
     * @return {audioNode}
     * @protected
     * @since 0.4.1
     */
    p._createAndPlayAudioNode = function(startTime, offset) {
        var audioNode = s.context.createBufferSource();
        audioNode.buffer = this.playbackResource;
        audioNode.connect(this.panNode);
        var dur = this._duration * 0.001;
        audioNode.startTime = startTime + dur;
        audioNode.start(audioNode.startTime, offset+(this._startTime*0.001), dur - offset);
        return audioNode;
    };

    p._pause = function () {
        this._position = (s.context.currentTime - this._playbackStartTime) * 1000;  // * 1000 to give milliseconds, lets us restart at same point
        this.sourceNode = this._cleanUpAudioNode(this.sourceNode);
        this._sourceNodeNext = this._cleanUpAudioNode(this._sourceNodeNext);

        if (this.gainNode.numberOfOutputs != 0) {this.gainNode.disconnect(0);}

        clearTimeout(this._soundCompleteTimeout);
    };

    p._resume = function () {
        this._handleSoundReady();
    };

    /*
     p._handleStop = function () {
     // web audio does not need to do anything extra
     };
     */

    p._updateVolume = function () {
        var newVolume = this._muted ? 0 : this._volume;
        if (newVolume != this.gainNode.gain.value) {
            this.gainNode.gain.value = newVolume;
        }
    };

    p._calculateCurrentPosition = function () {
        return ((s.context.currentTime - this._playbackStartTime) * 1000); // pos in seconds * 1000 to give milliseconds
    };

    p._updatePosition = function () {
        this.sourceNode = this._cleanUpAudioNode(this.sourceNode);
        this._sourceNodeNext = this._cleanUpAudioNode(this._sourceNodeNext);
        clearTimeout(this._soundCompleteTimeout);

        if (!this._paused) {this._handleSoundReady();}
    };

    // OJR we are using a look ahead approach to ensure smooth looping.
    // We add _sourceNodeNext to the audio context so that it starts playing even if this callback is delayed.
    // This technique is described here:  http://www.html5rocks.com/en/tutorials/audio/scheduling/
    // NOTE the cost of this is that our audio loop may not always match the loop event timing precisely.
    p._handleLoop = function () {
        this._cleanUpAudioNode(this.sourceNode);
        this.sourceNode = this._sourceNodeNext;
        this._playbackStartTime = this.sourceNode.startTime;
        this._sourceNodeNext = this._createAndPlayAudioNode(this._playbackStartTime, 0);
        this._soundCompleteTimeout = setTimeout(this._endedHandler, this._duration);
    };

    p._updateDuration = function () {
        if(this.playState == createjs.Sound.PLAY_SUCCEEDED) {
            this._pause();
            this._resume();
        }
    };
    createjs.BinaryWebAudioSoundInstance = createjs.promote(BinaryWebAudioSoundInstance, "WebAudioSoundInstance");
}());
