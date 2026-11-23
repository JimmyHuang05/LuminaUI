// Dedicated reference state: the three images belong to image-to-image, not the edit input.
let imageReferences=[];
const imageReferenceRoles=[['subject','主体外观'],['identity','人物身份'],['pose','姿势动作'],['clothing','服装配饰'],['composition','构图镜头'],['scene','场景背景'],['style','画风光线'],['custom','自由描述']];
const imageReferenceField=document.createElement('div');imageReferenceField.id='image-references-field';imageReferenceField.className='field';imageReferenceField.hidden=true;
document.getElementById('image-field').before(imageReferenceField);
function renderImageReferences(){
  imageReferenceField.replaceChildren();const label=document.createElement('label');label.textContent='参考图片 · 最多 3 张';imageReferenceField.append(label);
  for(let index=0;index<3;index++){
    const ref=imageReferences[index],card=document.createElement('div');card.className='image-reference-card';const heading=document.createElement('div');heading.className='image-reference-heading';const name=document.createElement('b');name.textContent='图'+(index+1);heading.append(name);
    const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.hidden=true;
    async function receive(selected){if(!selected||uploading)return;uploading=true;$('submit').disabled=true;$('error').textContent='';try{const form=new FormData();form.append('image',selected);const d=await api('/api/upload',{method:'POST',body:form});assign(d.image);}catch(e){$('error').textContent=e.message;}finally{uploading=false;$('submit').disabled=!online||busy;file.value='';}}
    function assign(image){const slot=ref?index:imageReferences.length;imageReferences[slot]={image,role:ref?.role||'subject',description:ref?.description||''};renderImageReferences();if(slot===0)showUploadedCanvas(inputURL(image));}
    const pick=document.createElement('button');pick.type='button';pick.className='secondary reference-pick';pick.setAttribute('aria-label',(ref?'替换':'上传')+'图'+(index+1));pick.onclick=()=>file.click();
    if(ref){const im=new Image();im.src=inputURL(ref.image);im.alt='图'+(index+1);pick.append(im);const replace=document.createElement('span');replace.textContent='替换图片';pick.append(replace);const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='移除';remove.setAttribute('aria-label','移除图'+(index+1));remove.onclick=()=>{imageReferences.splice(index,1);renderImageReferences();};heading.append(remove);}else pick.textContent='＋ 上传或拖入图片';
    file.onchange=()=>receive(file.files[0]);bindImageDrop(card,receive,e=>$('error').textContent=e.message,()=>!uploading&&!busy);
    card.append(heading,pick,file);
    if(ref){const role=document.createElement('select');role.setAttribute('aria-label','图'+(index+1)+'的用途');for(const [value,text] of imageReferenceRoles){const option=document.createElement('option');option.value=value;option.textContent=text;role.append(option);}role.value=ref.role;role.onchange=()=>ref.role=role.value;const description=document.createElement('textarea');description.maxLength=1000;description.setAttribute('aria-label','图'+(index+1)+'的用途说明');description.placeholder='补充：仅参考什么、哪些内容不要参考';description.value=ref.description||'';description.oninput=()=>ref.description=description.value;card.append(role,description);}
    imageReferenceField.append(card);
    // Empty slots appear sequentially, so image numbering always matches the model input order.
    if(!ref)break;
  }
}
renderImageReferences();
window.addEventListener('creative-mode-change',()=>{if(mode==='02_character_consistency')renderImageReferences();});
