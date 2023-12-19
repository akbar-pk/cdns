export class WebAudioRecorder {
  constructor(sourceNode, configs) {
    this.CONFIGS = {
      workerDir: "/",
      numChannels: 1,
      encoding: "wav",
      options: {
        timeLimit: 300,
        encodeAfterRecord: false,
        progressInterval: 1000,
        bufferSize: undefined,
        wav: {
          mimeType: "audio/wav",
        },
        ogg: {
          mimeType: "audio/ogg",
          quality: 0.5,
        },
        mp3: {
          mimeType: "audio/mpeg",
          bitRate: 160,
        },
      },
    };

    this.extend = function () {
      let target = arguments[0];
      let sources = [].slice.call(arguments, 1);
      for (let i = 0; i < sources.length; ++i) {
        let src = sources[i];
        for (let key in src) {
          let val = src[key];
          target[key] =
            typeof val === "object"
              ? this.extend(
                  typeof target[key] === "object" ? target[key] : {},
                  val
                )
              : val;
        }
      }
      return target;
    };

    this.extend(this, this.CONFIGS, configs || {});
    this.context = sourceNode.context;
    if (this.context.createScriptProcessor == null)
      this.context.createScriptProcessor = this.context.createJavaScriptNode;
    this.input = this.context.createGain();
    sourceNode.connect(this.input);
    this.buffer = [];
    this.initWorker();
  }

  isRecording() {
    return this.processor != null;
  }

  setEncoding(encoding) {
    if (this.isRecording())
      this.error("setEncoding: cannot set encoding during recording");
    else if (this.encoding !== encoding) {
      this.encoding = encoding;
      this.initWorker();
    }
  }

  setOptions(options) {
    if (this.isRecording())
      this.error("setOptions: cannot set options during recording");
    else {
      this.extend(this.options, options);
      this.worker.postMessage({
        command: "options",
        options: this.options,
      });
    }
  }

  startRecording() {
    if (this.isRecording())
      this.error("startRecording: previous recording is running");
    else {
      let numChannels = this.numChannels,
        buffer = this.buffer,
        worker = this.worker;
      this.processor = this.context.createScriptProcessor(
        this.options.bufferSize,
        this.numChannels,
        this.numChannels
      );
      this.input.connect(this.processor);
      this.processor.connect(this.context.destination);
      this.processor.onaudioprocess = (event) => {
        for (let ch = 0; ch < numChannels; ++ch)
          buffer[ch] = event.inputBuffer.getChannelData(ch);
        worker.postMessage({ command: "record", buffer: buffer });
      };
      this.worker.postMessage({
        command: "start",
        bufferSize: this.processor.bufferSize,
      });
      this.startTime = Date.now();
    }
  }

  recordingTime() {
    return this.isRecording()
      ? (Date.now() - this.startTime) * 0.001
      : null;
  }

  cancelRecording() {
    if (this.isRecording()) {
      this.input.disconnect();
      this.processor.disconnect();
      delete this.processor;
      this.worker.postMessage({ command: "cancel" });
    } else this.error("cancelRecording: no recording is running");
  }

  finishRecording() {
    if (this.isRecording()) {
      this.input.disconnect();
      this.processor.disconnect();
      delete this.processor;
      this.worker.postMessage({ command: "finish" });
    } else this.error("finishRecording: no recording is running");
  }

  cancelEncoding() {
    if (this.options.encodeAfterRecord)
      if (this.isRecording())
        this.error("cancelEncoding: recording is not finished");
      else {
        this.onEncodingCanceled(this);
        this.initWorker();
      }
    else this.error("cancelEncoding: invalid method call");
  }

  initWorker() {
    if (this.worker != null) this.worker.terminate();
    this.onEncoderLoading(this, this.encoding);
    this.worker = new Worker(this.workerDir + WORKER_FILE[this.encoding]);
    this.worker.onmessage = (event) => {
      let data = event.data;
      switch (data.command) {
        case "loaded":
          this.onEncoderLoaded(this, this.encoding);
          break;
        case "timeout":
          this.onTimeout(this);
          break;
        case "progress":
          this.onEncodingProgress(this, data.progress);
          break;
        case "complete":
          this.onComplete(this, data.blob);
          break;
        case "error":
          this.error(data.message);
      }
    };
    this.worker.postMessage({
      command: "init",
      config: {
        sampleRate: this.context.sampleRate,
        numChannels: this.numChannels,
      },
      options: this.options,
    });
  }

  error(message) {
    this.onError(this, "WebAudioRecorder.js:" + message);
  }

  onEncoderLoading(recorder, encoding) {}

  onEncoderLoaded(recorder, encoding) {}

  onTimeout(recorder) {
    recorder.finishRecording();
  }

  onEncodingProgress(recorder, progress) {}

  onEncodingCanceled(recorder) {}

  onComplete(recorder, blob) {
    recorder.error(
      recorder,
      "WebAudioRecorder.js: You must override .onComplete event"
    );
  }

  onError(recorder, message) {
    console.log(message);
  }
}

export const WORKER_FILE = {
  wav: "WebAudioRecorderWav.js",
  ogg: "WebAudioRecorderOgg.js",
  mp3: "WebAudioRecorderMp3.js",
};

window.WebAudioRecorder = WebAudioRecorder;
