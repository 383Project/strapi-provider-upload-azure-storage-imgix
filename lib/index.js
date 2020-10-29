const {
  Aborter,
  BlobURL,
  BlockBlobURL,
  ContainerURL,
  ServiceURL,
  StorageURL,
  SharedKeyCredential,
  uploadStreamToBlockBlob,
} = require("@azure/storage-blob");
const BufferStream = require("./BufferStream");

const trimParam = (str) => (typeof str === "string" ? str.trim() : undefined);

const imageFileExtensions = [
  ".tif",
  ".tiff",
  ".gif",
  ".jpeg",
  ".jpg",
  ".jif",
  ".jfif",
  ".png",
  ".bmp",
  ".webp",
  ".heif",
  ".heic",
  ".jp2",
  ".j2k",
  ".jpf",
  ".jpx",
  ".jpm",
  ".mj2",
  ".svg",
];

module.exports = {
  provider: "azure",
  auth: {
    account: {
      label: "Account name",
      type: "text",
    },
    accountKey: {
      label: "Secret Access Key",
      type: "text",
    },
    serviceBaseURL: {
      label:
        "Base service URL to be used, optional. Defaults to https://${account}.blob.core.windows.net",
      type: "text",
    },
    containerName: {
      label: "Container name",
      type: "text",
    },
    defaultPath: {
      label: "The path to use when there is none being specified",
      type: "text",
    },
    maxConcurent: {
      label: "The maximum concurrent uploads to Azure",
      type: "number",
    },
  },
  init: (config) => {
    const { azure, imgix } = config;

    const account = trimParam(azure.account);
    const accountKey = trimParam(azure.accountKey);
    const sharedKeyCredential = new SharedKeyCredential(account, accountKey);
    const pipeline = StorageURL.newPipeline(sharedKeyCredential);
    const serviceBaseURL =
      trimParam(azure.serviceBaseURL) ||
      `https://${account}.blob.core.windows.net`;
    const serviceURL = new ServiceURL(serviceBaseURL, pipeline);
    const containerURL = ContainerURL.fromServiceURL(
      serviceURL,
      azure.containerName
    );

    return {
      upload: (file) =>
        new Promise((resolve, reject) => {
          const fileName = file.hash + file.ext;
          const containerWithPath = Object.assign({}, containerURL);
          containerWithPath.url += file.path
            ? `/${file.path}`
            : `/${azure.defaultPath}`;

          const blobURL = BlobURL.fromContainerURL(containerWithPath, fileName);
          const blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);

          file.url = Boolean(
            imageFileExtensions.find((ext) => ext === file.ext)
          )
            ? `${imgix.serviceBaseURL}/${fileName}`
            : blobURL.url;

          return uploadStreamToBlockBlob(
            Aborter.timeout(60 * 60 * 1000),
            new BufferStream(file.buffer),
            blockBlobURL,
            4 * 1024 * 1024,
            ~~azure.maxConcurent || 20,
            {
              blobHTTPHeaders: {
                blobContentType: file.mime,
              },
            }
          ).then(resolve, reject);
        }),
      delete: (file) =>
        new Promise((resolve, reject) => {
          const _temp = file.url
            .replace(containerURL.url, "")
            .replace(imgix.serviceBaseURL, azure.defaultPath);
          const pathParts = _temp.split("/").filter((x) => x.length > 0);
          const fileName = pathParts.splice(pathParts.length - 1, 1);
          const containerWithPath = Object.assign({}, containerURL);
          containerWithPath.url += "/" + pathParts.join("/");

          const blobURL = BlobURL.fromContainerURL(containerWithPath, fileName);
          const blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);

          return blockBlobURL.delete().then(resolve, (err) => reject(err));
        }),
    };
  },
};
