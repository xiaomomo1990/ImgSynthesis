/*
 * PictureSynthesis.js 0.0.1
 * 
 */
 (function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) : (global.PictureSynthesis = factory());
}(this, function(){

	/*
	 * 助手类
	 */
	const util = {
		/*
		 * 深度克隆(暂时只针对object/array/基础类型的拷贝)
		 */
		deepClone: (target, map = new WeakMap()) => {
			if(util.isObject(target)) {
				const isArray = Array.isArray(target);
				let cloneTarget = isArray ? [] : {};

				// 防止循环引用
				if(map.get(target)) {
					return map.get(target);
				}

				map.set(target,cloneTarget);

				const keys = isArray ? target : Object.keys(target);

				keys.forEach((key,index) => {
					cloneTarget[key] = util.deepClone(target[key], map); // 迭代遍历
				});

				return cloneTarget;
			} else {
				return target;
			}
		},
		/*
		 * 判断是否是object对象
		 */
		isObject: (target) => {
			const type = typeof target;
			return target !== null && (type === 'object' || type === 'function');
		},
		/*
		 * 获取变量类型
		 */
		getType: (target) => { 		
			return Object.prototype.toString.call(target).replace(/(\[|\]|object|\s+)/g,'');
		},
	}

	/*
	 * 多图片加载器
	 */
	function imgsLoader(imgArrs) {
		const nImgArrs = [];
		let count = 0;
		return new Promise(async (resolve,reject) => {
			for(let item of imgArrs) { // 使用for...of...让图片加载串行依照数组顺序执行
				console.log('item-old', item);
				await loader(item).then((item) => {
					nImgArrs.push(item);
					count += 1;
					if(imgArrs.length === count) { // 所有的图片加载完毕，返回所有图片对象
						resolve(nImgArrs);
					}
				}).catch(() => { // 如有一张图片加载出错，停止加载，返回错误
					reject();
				});
			}
			// imgArrs.forEach(async (item) => {
				
			// });
		});
		
	}	

	/*
	 * 图片加载处理
	 */
	function loader(item) {
		return new Promise((resolve,reject) => {
			const img = new Image();
			const nItem = util.deepClone(item);
			// img.crossOrigin = 'anonymous';
			typeof nItem.crossOrigin !== 'undefined' && img.setAttribute("crossOrigin",'Anonymous');
			img.src = nItem.url;
			img.onload = function() {
				nItem.img = img;
				resolve(nItem);
			};
			img.onerror = function() {				
				reject();
			};
		});		
	};

	/*
	 * 将base64转换为文件
	 * 使用worker启用多线程异步转化，减少因当前方法大计算量导致当前界面操作卡顿现象
	 * 无需创建Worker文件即可启用Worker
	 */	
    function dataURLtoOther(dataurl, filename, format) {
      const work = () => {
        onmessage = ({ data: { jobId, message } }) => {
          var arr = message.split(","),
            mime = arr[0].match(/:(.*?);/)[1],
            bstr = atob(arr[1]),
            n = bstr.length,
            u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          postMessage({ jobId, result: { u8arr, mime } });
        };
      };
      const makeWorker = (f) => {
        let pendingJobs = {};
        //不用创建worker文件
        const worker = new Worker(URL.createObjectURL(new Blob([`(${f.toString()})()`])));

        worker.onmessage = ({ data: { result, jobId } }) => {
          // 调用resolve，改变Promise状态
          pendingJobs[jobId](result);
          // 删掉，防止key冲突
          delete pendingJobs[jobId];
        };

        return (message) =>
          new Promise((resolve) => {
            const jobId = String(Math.random());
            pendingJobs[jobId] = resolve;
            worker.postMessage({ jobId, message });
          });
      };

      return new Promise((resolve, reject) => {
        const testWorker = makeWorker(work);

        testWorker(dataurl).then((data) => {
          const returnFormat = format === 'file' ? 	new File([data.u8arr], filename, { type: data.mime }) : new Blob([data.u8arr], { type: data.mime });
          resolve(returnFormat);
        });
      });
    };

	/*
     * 图片合成类
	 */
	class PictureSynthesis {
		constructor({mainImg = {}, elesImg = [], type = 'image/png'}) {
			this.options = Object.assign({},{mainImg, elesImg ,type});			
			if(typeof this.options.mainImg === 'object' && this.options.elesImg instanceof Array) {
				// 新建画布
				this.canvas = document.createElement("canvas");
				this.ctx = this.canvas.getContext("2d");
				this.canvas.width = this.options.mainImg.w; // 设置canvas宽度
				this.canvas.height = this.options.mainImg.h; // 设置canvas高度
				this.imgs = null; // 需要合成的图片对象
				this.combImg = null;			
			}
		}
		/*
	     * 加载并合成图片处理
	     * 结果返回base64位图片格式
		 */
		_combination() {
			return new Promise((resolve, reject) => {	        	
	        	imgsLoader([this.options.mainImg].concat(this.options.elesImg)).then((items) => {
					this.imgs = items;
					// 遍历当前需要合并的图片对象绘制到canvas只上
					console.log('items', items);
					this.imgs.forEach(async (item, index) => {
						console.log('item.img', item.img);
						let x = item.l || 0,
							y = item.t || 0,
							w = item.w,
							h = item.h,
							img = item.img;
						await this.ctx.drawImage(img, x, y, w, h);
					});
					console.log(this.options.type);
					resolve(this.canvas.toDataURL(this.options.type));
				});
	        });
		}
		/*
	     * 获取base64位格式图
		 */
		getBase64({cb = function(){}}) {			
			this._combination().then((DataURL) => {
				cb(DataURL);
			});
		}
		/*
	     * 获取file格式图
		 */
		getFile({name = 'combination-pic.png', cb = function(){}}) {
			this._combination().then((DataURL) => {
				dataURLtoOther(DataURL, name, 'file').then((file) => {
					cb(file);
				});
			});
		}

		/*
	     * 获取Blob格式图
		 */
		getBlob({name = 'combination-pic.png', cb = function(){}}) {
			this._combination().then((DataURL) => {
				dataURLtoOther(DataURL, name, 'Blob').then((Blob) => {
					cb(Blob);
				});
			});
		}

	}

	return PictureSynthesis;

}));