import {
	UploaderInterface,
	FileInfo,
	UploaderOptions,
	File,
} from '../../types/request';
import { getExtensionName, getFileSize } from './utils';
import Ajax from '../ajax';

class Uploader implements UploaderInterface {
	private options: UploaderOptions;
	private uploadingFiles: Array<FileInfo> = [];

	constructor(options: UploaderOptions) {
		this.options = options;
	}

	createUid(text: string | number) {
		return Date.now() + '-' + text;
	}

	async request(files: Array<File>, name?: string) {
		files.forEach(async (file, index) => {
			if (!file.uid) file.uid = this.createUid(index);
			if ((await this.handleBefore(file, files)) === false) {
				files.splice(index, 1);
			}
		});
		this.upload(files, name);
	}

	private async upload(files: Array<File>, name: string = 'file') {
		files.forEach(async (file) => {
			const formData = new FormData();
			formData.append(name, file, file.name);
			if (file.data) {
				Object.keys(file.data).forEach((key) => {
					formData.append(key, file.data![key]);
				});
			}
			const {
				url,
				data,
				onUploading,
				onSuccess,
				onError,
				crossOrigin,
				headers,
			} = this.options;
			if (data) {
				Object.keys(data).forEach((key) => {
					formData.append(key, data![key]);
				});
			}
			await new Ajax({
				xhr: () => {
					const xhr = new window.XMLHttpRequest();
					xhr.upload.addEventListener(
						'progress',
						(evt) => {
							if (evt.lengthComputable) {
								if (onUploading)
									onUploading(file, {
										percent: parseInt(
											(
												(evt.loaded / evt.total) *
												100
											).toString(),
											10,
										),
									});
							}
						},
						false,
					);
					return xhr;
				},
				url,
				data: formData,
				contentType: this.options.contentType,
				type: this.options.type || 'json',
				crossOrigin: crossOrigin,
				headers: headers,
				success: (response: any) => {
					if (onSuccess) onSuccess(response, file);
				},
				error: (err) => {
					if (onError) onError(err, file);
				},
				method: 'POST',
				processData: true,
			});
		});
	}

	handleBefore(file: File, files: Array<File>) {
		const { type, uid, name, size } = file;
		const ext = getExtensionName(file);
		const { onBefore } = this.options;
		if (onBefore && onBefore(file) === false) {
			return false;
		}
		return new Promise<boolean>((resolve, reject) => {
			const fileReader = new FileReader();
			fileReader.addEventListener(
				'load',
				() => {
					this.uploadingFiles[uid!] = {
						uid,
						src: fileReader.result,
						name,
						size,
						type,
						ext,
					};
					//全部图片读取完成后再插入编辑器
					if (
						files.every((file) => !!this.uploadingFiles[file.uid!])
					) {
						files.forEach((file) => {
							if (this.options.onReady) {
								this.options.onReady(
									this.uploadingFiles[file.uid!],
									file,
								);
							}
						});
					}
					resolve(true);
				},
				false,
			);

			fileReader.addEventListener('error', () => {
				reject(false);
			});

			fileReader.readAsDataURL(file);
		});
	}
}

export default Uploader;

export { getExtensionName, getFileSize };
