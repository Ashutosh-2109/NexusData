import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MaharashtraMap from './MaharashtraMap';
import type { MaharashtraDistrict, MaharashtraMeta, MaharashtraGeo } from './types';

const blankMetrics = { population_2011: 900, density_2011: 10, literacy_2011_percent: 80, population_growth_2001_11: 0.1,
  health_facilities_per_lakh: null, health_sub_centres: null, primary_health_centres: null, dispensaries: null,
  sub_district_hospitals: null, district_hospitals: null, general_hospitals: null, women_hospitals: null,
  rural_hospitals: null, total_reported_health_facilities: null, schools_per_10_sq_km: 2, secondary_dropout_percent: 3,
  forest_land_percent: 4, per_capita_income_source_units: null, domestic_electricity_kwh_per_capita: 4,
  industrial_electricity_kwh_per_capita: 5, vehicles_per_lakh: 6, underweight_severe_percent: 1, underweight_moderate_percent: 2 };
const districts: MaharashtraDistrict[] = ['Alpha','Beta'].map((name,index)=>({id:name.toLowerCase(),name,metrics:{...blankMetrics},statistics:{},coverage_warning:index===0?'No separate health match.':null,census_series:[]}));
const dictionary = Object.fromEntries(Object.keys(blankMetrics).map(key=>[key,{label:key.replaceAll('_',' '),unit:'count',source_sheet:'DISTRICT Master',caveat:''}]));
const meta: MaharashtraMeta = {district_count:2,temporal_scope:'reference years vary / unspecified',source_note:'test',counts:{},data_dictionary:dictionary,quality_summary:[],quality_rules:[]};
const polygon=(name:string,id:string,offset:number)=>({type:'Feature' as const,id,properties:{id,name,source_name:name,soi_district_code:'',state_lgd_code:''},geometry:{type:'Polygon' as const,coordinates:[[[72+offset,18],[73+offset,18],[73+offset,19],[72+offset,19],[72+offset,18]]]}});
const geo: MaharashtraGeo={type:'FeatureCollection',features:[polygon('Alpha','alpha',0),polygon('Beta','beta',1)]};

beforeEach(()=>{
  class MockResizeObserver { observe(){} disconnect(){} }
  vi.stubGlobal('ResizeObserver',MockResizeObserver);
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>undefined,removeEventListener:()=>undefined}));
  vi.stubGlobal('fetch',vi.fn((url:string)=>Promise.resolve({ok:true,json:async()=>url.includes('/districts')?{districts}:url.includes('/meta')?meta:geo})));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

describe('Maharashtra district map',()=>{
  it('renders a complete grouped district card with explicit unknown values and coverage warning',async()=>{
    render(<MaharashtraMap/>);
    await screen.findByRole('heading',{name:'Maharashtra, district by district'}); const shape=document.querySelector('path[data-district="Alpha"]') as SVGPathElement;
    fireEvent.mouseEnter(shape);
    await waitFor(()=>expect(screen.getByText('Health infrastructure')).toBeTruthy());
    expect(screen.getAllByText('No data').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/No separate health match/).length).toBeGreaterThan(0);
    expect(screen.getByText('Land and nutrition')).toBeTruthy();
  });
  it('pins a district by keyboard activation and clears with Escape',async()=>{
    render(<MaharashtraMap/>);
    await screen.findByRole('heading',{name:'Maharashtra, district by district'}); const shape=document.querySelector('path[data-district="Alpha"]') as SVGPathElement;
    shape.focus();
    fireEvent.keyDown(shape,{key:'Enter'});
    expect(screen.getByLabelText('Alpha district statistics')).toBeTruthy();
    expect(document.querySelector('.mah-selected-panel')).toBeTruthy();
    fireEvent.keyDown(shape,{key:'Escape'});
    await waitFor(()=>expect(screen.queryByLabelText('Alpha district statistics')).toBeNull());
  });
});




