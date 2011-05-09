window.AudioContext = webkitAudioContext;

window.AudioBuffer = new AudioContext().createBuffer(0, 0, 0).constructor;

var TWO_CHANNELS = 2;
var SAMPLE_RATE = 2;

var BufferMethods = {
    slice: function (begin, end) {
        var channelData = [];
        var i;
        var end = end || this.length;
        for (i = 0; i < this.numberOfChannels; i++) {
            channelData.push(this.getChannelData(i).subarray(begin, end));
        }
        return new FakeAudioBuffer(this.sampleRate, channelData);
    },

    extract: function (target, length, startPosition) {
        var slice = this.slice(startPosition, startPosition + length);
        target.set(slice);
        return slice.length;
    },

    set: function (buffer, offset) {
        for (var i = 0; i < this.numberOfChannels; i++) {
            this.getChannelData(i).set(buffer.getChannelData(i), offset);
        }
    }
};

_.extend(AudioBuffer.prototype, BufferMethods);

function FakeAudioBuffer(sampleRate, channelData) {
    this._sampleRate = sampleRate;
    this._channelData = channelData;
}

FakeAudioBuffer.createEmpty = function(numberOfChannels, length, sampleRate) {
    var channelData = [];
    var i;
    for (i = 0; i < numberOfChannels; i++) {
        channelData.push(new Float32Array(length));
    }
    return new FakeAudioBuffer(sampleRate, channelData);
}

FakeAudioBuffer.prototype = {
    get length() {
        return this._channelData[0].length;
    },

    get numberOfChannels() {
        return this._channelData.length;
    },

    get sampleRate() {
        return this._sampleRate;
    },

    getChannelData: function (channel) {
        return this._channelData[channel];
    }
};

_.extend(FakeAudioBuffer.prototype, BufferMethods);

function AudioBufferSampleSource(audioBuffer) {
    this._audioBuffer = audioBuffer;
}

AudioBufferSampleSource.prototype = {
    extract: function (target, length, startPosition) {
        return this._audioBuffer.extract(target, length, startPosition);
    },

    toSourcePosition: function (position) {
        return position;
    },

    get length() {
        return this._audioBuffer.length;
    }
};

function RangeSampleSource(source, offset, length) {
    this.source = source;
    this._offset = offset;
    this._length = length;
}

RangeSampleSource.prototype = {
    extract: function (target, length, startPosition) {
        if (!startPosition) {
            startPosition = 0;
        }
        length = Math.min(length, this._length - startPosition);
        return this.source.extract(target, length, this._offset + startPosition);
    },

    toSourcePosition: function(position) {
        return this._offset + position;
    },

     get offset() {
        return this._offset;
    },

    get length() {
        return this._length;
    }
};

function SampleSourcePlayer(context, bufferSize) {
    this._context = context;
    this.playing = false;
    this._offset = 0;
    this._jsNode = context.createJavaScriptNode(bufferSize, 0, 1);
    this._jsNode.onaudioprocess = _.bind(function (e) {
        var length = this._sampleSource.extract(e.outputBuffer, bufferSize, this._offset);
        var finished = false;

        if (length < bufferSize) {
            // TODO event
            // this cuts off the end of the source
            this.stop();
        }
        this._offset += bufferSize;
    }, this);

    this.positionOffset = 0;
}

SampleSourcePlayer.prototype = {
    set sampleSource(sampleSource) {
        this._sampleSource = sampleSource;
    },

     start: function() {
         if (!this.playing) {
             this._jsNode.connect(this._context.destination);
             this.positionOffset = this._context.currentTime;
         }
         this.playing = true;
    },

    stop: function() {
      if (this.playing) {
          this._jsNode.disconnect();
        this.playing = false;
      }
    },

    get position() {
        return Math.floor((this._context.position - this.positionOffset) * 44.1);
    },

    get sourcePosition() {
      return this._sampleSource.toSourcePosition(position);
    },

    get sourceLength() {
      return this._sampleSource.length;
    }
};

function SourceListItem() {};

SourceListItem.prototype = {
    toSourcePosition: function (position) {
        return this.source.toSourcePosition(position - this.startOffset);
    },

    extract: function (target, length, startPosition) {
        return this.source.extract(target, length, startPosition - this.startOffset);
    }
};

function SourceList(sources) {
    this._length = 0;
    this._sources = [];
    var index = 0;
    _.each(sources, function (item) {
        var s = new SourceListItem();
        s.startOffset = this._length;
        this._length += item.length;
        s.endOffset = this._length;
        s.length = item.length;
        s.source = item;
        s.index = index++;

        this._sources.push(s);
    }, this);

    this.sli = this._sources[0];
    this.positionSli = this.sli;

    this.outputPosition = 0;
}

SourceList.prototype = {
    extract: function(target, length, startPosition) {
        if (_.isUndefined(startPosition)) {
            if (startPosition != this.outputPosition) {
                this.outputPosition = startPosition;
                this.sli = seek(this.outputPosition, this.sli);
            }
        }

        var framesRead = 0;
        while (!this.finished && framesRead < length) {
            var framesLeft = this.sli.endOffset - this.outputPosition;
            var framesToRead = Math.min(framesLeft, length - framesRead);
            var currentFramesRead = this.sli.extract(target, framesToRead, this.outputPosition);
            target = target.slice(currentFramesRead);

            framesRead += framesToRead;
            this.outputPosition += framesToRead;
            if (this.outputPosition == this.sli.endOffset) {

                if (this.sli.index == this._sources.length - 1) {
                    this.finished = true;
                }
                else {
                    this.sli = this._sources[this.sli.index + 1];
                }
            }
        }
        return framesRead;
    },

    toSourcePosition: function(position) {
        this.positionSli = seek(position, this.positionSli);
        return this.positionSli.toSourcePosition(position);
    },

    getSource: function(position) {
        this.positionSli = this.seek(position, this.positionSli);
        return {index: this.positionSli.index, position: this.positionSli.toSourcePosition(position)};
    },

    seek: function(position, seekSli) {
        while (position > seekSli.endOffset) {
            seekSli = this._sources[seekSli.index + 1];
        }
        while (position < seekSli.startOffset) {
            seekSli = this._sources[seekSli.index - 1];
        }

        return seekSli;
    },

    get length() {
        return this._length;
    },

    get sampleSourceIndex() {
        return this.positionSli.index;
    }
};
