import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import { exec } from 'child_process';

type CutTime = {
  silenceEnd: number;
  silenceDuration: number;
};

async function cutSilence(inputFile: string, cutTimeList: CutTime[]) {
  const promises: Promise<string>[] = [];

  for (let i = 1; i < cutTimeList.length; i++) {
    const outputFile = getResourcePath(`output${i}.mp4`);
    const start = cutTimeList[i - 1].silenceEnd;

    // カットした動画の後ろにわずかな空白時間を置いて、
    // 違和感を少しでも緩和する
    const endMargin = i === cutTimeList.length - 1 ? 0.5 : 0.1;

    const duration =
      cutTimeList[i].silenceEnd -
      cutTimeList[i].silenceDuration -
      cutTimeList[i - 1].silenceEnd +
      endMargin;

    const promise: Promise<string> = new Promise((resolve, reject) => {
      ffmpeg({ source: inputFile })
        .setStartTime(start)
        .duration(duration)
        .on('error', function (err) {
          console.log(
            `An error occurred: (index: ${i}) : error message is "${err.message}"`
          );
          reject(err);
        })
        .on('end', function () {
          console.log(`Processing finished !(index: ${i})`);
          resolve(outputFile);
        })
        .save(outputFile);
    });
    promises.push(promise);
  }

  const outputFiles = await Promise.all(promises);
  const merge = ffmpeg();
  outputFiles.forEach((of) => merge.addInput(of));
  console.log('Merge process start!');
  merge
    .mergeToFile(getResourcePath('mergedVideo.mp4'))
    .on('error', function (err) {
      console.log(`merge error occurred: "${err.message}"`);
    })
    .on('progress', function (progress) {
      console.log('Merge Processing: ' + progress.percent + '% done');
    })
    .on('end', function () {
      console.log(`merge processing finished !`);
    });
}

const getResourcePath = (fileName: string) => {
  return path.resolve(process.cwd(), 'resources', fileName);
};

const detectSilenceTime = async (inputFile: string) => {
  // https://ffmpeg.org/ffmpeg-filters.html#silencedetect
  const n = '-20dB'; // noise
  const d = 0.5; // duration

  return new Promise<CutTime[]>((resolve, reject) => {
    exec(
      // https://donaldfeury.xyz/remove-the-silent-parts-of-a-video-using-ffmpeg-and-python/
      `ffmpeg -hide_banner -vn -i ${inputFile} -af "silencedetect=n=${n}:d=${d}" -f null - 2>&1 | grep " silence_end" |  awk '{print $5 " " $8}'`,
      (err, stdout, stderr) => {
        /**
         * stdout looks like below.
         * (silence_end silence_duration)
         * 1.70011 1.70011
         * 8.15621 1.70224
         * 10.5697 1.57048
         */

        if (err) {
          console.log(`stderr: ${stderr}`);
          reject();
          return;
        }
        const splittedByLine = stdout.split('\n').filter((v) => v.length > 0);
        const splittedBySpace = splittedByLine.map((line) => line.split(' '));
        const cutTimeList = splittedBySpace.map(
          ([silenceEnd, silenceDuration]) => {
            return {
              silenceEnd: parseFloat(silenceEnd),
              silenceDuration: parseFloat(silenceDuration),
            } as CutTime;
          }
        );

        console.log(cutTimeList);

        resolve(cutTimeList);
      }
    );
  });
};

const inputFile = getResourcePath('original.mp4');

const run = async () => {
  const cutTimeList = await detectSilenceTime(inputFile);
  cutSilence(getResourcePath('original.mp4'), cutTimeList);
};

run();
