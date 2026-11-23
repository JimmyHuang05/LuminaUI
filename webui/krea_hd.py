"""Local Krea2 4KHD adaptation and shared SeedVR2 output stage."""
import storage_paths
import json
import workflow_controls
from copy import deepcopy
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def seedvr(graph, source, width, height, seed):
    template = json.loads((storage_paths.path('workflows')/'seedvr2_3b_upscale_api.json').read_text(encoding='utf-8'))
    for old, new in [('2','hd_dit'),('3','hd_vae')]:
        graph[new] = deepcopy(template[old])
    inputs = deepcopy(template['4']['inputs'])
    inputs.update(image=source,dit=['hd_dit',0],vae=['hd_vae',0],seed=seed % 2**32,
                  resolution=min(width,height),max_resolution=max(width,height))
    graph['hd_seedvr'] = {'class_type':'SeedVR2VideoUpscaler','inputs':inputs}
    # SeedVR internally rounds dimensions; enforce the advertised final canvas.
    graph['hd_output'] = {'class_type':'ImageScale','inputs':dict(image=['hd_seedvr',0],upscale_method='lanczos',width=width,height=height,crop='disabled')}
    graph['9']['inputs']['images'] = ['hd_output',0]

def build(graph, width, height, seed, settings=None):
    settings=workflow_controls.resolve({"generation_workflow":"moody_krea2_4khd","workflow_settings":settings or {}})
    defaults=json.loads(Path(__file__).with_name('krea_hd_defaults.json').read_text(encoding='utf-8'))
    model=graph['7']['inputs']['model']
    if 'character_patch' in graph:
        # Tile and face sizes vary; avoid loading the VAE inside sampling.
        patch=deepcopy(graph['character_patch'])
        for key in ['vae','source_image','source_image_b','target_latent']:
            patch['inputs'].pop(key,None)
        patch['inputs']['fit_mode']='crop (legacy)'
        graph['hd_character_patch']=patch
        model=['hd_character_patch',0]
    graph['hd_resize']={'class_type':'ImageScale','inputs':dict(image=['8',0],upscale_method='bicubic',width=width*2,height=height*2,crop='disabled')}
    # Bicubic overshoot must not wrap around during USDU's uint8 conversion.
    graph['hd_clamp']={'class_type':'RemapImageRange','inputs':dict(image=['hd_resize',0],min=0.0,max=1.0,clamp=True)}
    tile={**defaults['UltimateSDUpscaleNoUpscale'],**dict(upscaled_image=['hd_clamp',0],model=model,positive=['4',0],negative=['6',0],vae=['3',0],seed=seed,steps=settings["tile_steps"],cfg=1.0,sampler_name='euler_ancestral',scheduler='beta',denoise=settings["tile_strength"],mode_type='Chess',tile_width=1024,tile_height=1024,mask_blur=64,tile_padding=96,tiled_decode=True)}
    graph['hd_tiles']={'class_type':'UltimateSDUpscaleNoUpscale','inputs':tile}
    graph['hd_color']={'class_type':'ColorMatch','inputs':dict(image_ref=['8',0],image_target=['hd_tiles',0],method='hm-mkl-hm',strength=0.23,multithread=True)}
    graph['hd_detector']={'class_type':'UltralyticsDetectorProvider','inputs':{'model_name':'bbox/face_yolov8m.pt'}}
    face={**defaults['FaceDetailer'],**dict(image=['hd_color',0],model=model,clip=['2',0],vae=['3',0],positive=['4',0],negative=['6',0],bbox_detector=['hd_detector',0],guide_size=1024,guide_size_for=True,max_size=1440,seed=seed,steps=settings["face_steps"],cfg=1.0,sampler_name='euler_ancestral',scheduler='beta',denoise=settings["face_strength"],bbox_threshold=0.5,bbox_dilation=11,bbox_crop_factor=2.3,feather=100,noise_mask=True,force_inpaint=True,wildcard='',cycle=1)}
    graph['hd_face']={'class_type':'FaceDetailer','inputs':face}
    factor=settings["output_long_edge"]/max(width,height)
    output=(max(8,round(width*factor/8)*8),max(8,round(height*factor/8)*8))
    if not settings['face_enabled']:
        graph.pop('hd_face');graph.pop('hd_detector')
    seedvr(graph,['hd_face' if settings['face_enabled'] else 'hd_color',0],*output,seed)
    return output
