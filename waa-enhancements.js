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
