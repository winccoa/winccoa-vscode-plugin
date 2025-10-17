// wincc_oa_dpconfigs.ts
// WinCC OA Data Point Configs -> Attributes mapping
// This file aggregates config names and their attributes as documented in the WinCC OA manuals.
// Each Set lists the attribute identifiers (neutral form).
// Notes:
// - Some configs support detail-specific attributes (e.g., _cmd_conv.<i>._type) and/or driver-specific attributes.
//   For such cases we include the base/common attributes and a few representative detail attributes; extend as needed.
// - The configs _original, _online and _offline share the same attribute set per docs.
//
// Reference tables (Data point configs and attributes):
//   https://www.winccoa.com/documentation/WinCCOA/latest/en_US/Notes/dpconfigs.html
//
// SPDX-License-Identifier: CC-BY-4.0 (attribution to WinCC OA documentation for identifiers and terminology)

export const dpConfigAttributes: Map<string, Set<string>> = new Map<string, Set<string>>([
  // Peripheral address (driver-dependent; base attributes)
  ['_address', new Set<string>([ //_address..
    '_type',
    '_active',
    '_reference',
    '_direction',
    '_drv_ident',
    '_poll_group'
    // Driver-specific attributes may exist; extend as needed.
  ])],

  // Alert class (acknowledgement behavior, colors, priority, archiving, etc.)
  ['_alert_class', new Set<string>([
    '_type',
    '_abbr',
    '_ack_type',
    '_archive',
    '_arg_list',
    '_color_c_ack',
    '_color_c_nack',
    '_fore_color_c_ack',
    '_fore_color_c_nack',
    '_perm',
    '_prior',
    '_panel',
    '_text',
    '_visible'
    // Additional visual and behavior attributes exist in docs.
  ])],

  // Alert handling (configuration + instance attributes)
  ['_alert_hdl', new Set<string>([
    '_type',
    '_active',
    '_class',
    '_direction',
    '_panel',
    '_dest',
    '_dest_text',
    '_inact_ack',
    '_visible',
    '_ackable',
    '_ack_state',
    '_ack_time',
    '_ack_user',
    '_state',
    '_single_state',
    '_alert_color',
    '_comment',
    '_add_values'
  ])],

  // Archiving
  ['_archive', new Set<string>([
    '_type',
    '_archive',
    '_class',
    '_round_inv',
    '_round_val',
    '_std_time',
    '_std_tol',
    '_std_type',
    // Detail per archive number: _archive.<i>._type, _class, _std_type, _std_tol
  ])],

  // Authorization
  ['_auth', new Set<string>([
    '_type',
    '_read',
    '_write',
    '_owner_read',
    '_owner_write'
  ])],

  // Command conversion (engineering -> raw); detail-specific attributes vary by conversion
  ['_cmd_conv', new Set<string>([
    '_type',
    // Detail index <i> = order of conversions (1..n)
    // Example (trigger conversion):
    '_trig_lim',
    '_trig_up'
  ])],

  // Connect information
  ['_connect', new Set<string>([
    '_dpids',
    '_manids',
    '_mancount'
  ])],

  // Correction values (offline)
  ['_corr', new Set<string>([
    '_type',
    '_value',
    '_stime',
    '_status64',
    '_user',
    '_manager'
  ])],

  // Default value handling
  ['_default', new Set<string>([
    '_type',
    '_value',
    '_set_ibit',
    '_set_pvrange',
    '_user',
    '_manager'
  ])],

  // Distribution (driver allocation)
  ['_distrib', new Set<string>([
    '_type',
    '_driver'
  ])],

  // Data point function
  ['_dp_fct', new Set<string>([
    '_type',
    '_fct',
    '_param',
    '_global',
    // Statistical / scheduling and status-related parameters:
    '_day',
    '_day_of_week',
    '_delay',
    '_def_func',
    '_def_limit',
    '_old_new_compare',
    '_interm',
    '_interm_res',
    '_interm_res_cyc',
    '_interval',
    '_inv_func',
    '_inv_limit',
    '_month',
    '_read_archive',
    '_stat_type',
    '_time',
    '_user1_func',
    '_user1_limit',
    '_user2_func',
    '_user2_limit',
    '_user3_func',
    '_user3_limit',
    '_user4_func',
    '_user4_limit',
    '_user5_func',
    '_user5_limit',
    '_user6_func',
    '_user6_limit',
    '_user7_func',
    '_user7_limit',
    '_user8_limit',   // as per docs (duplicate name used for func/limit)
    '_user8_limit'
  ])],

  // _general: free attributes per data type; give representative keys
  ['_general', new Set<string>([
    // Attributes follow the pattern _<type>_<nn>, nn = 01..05 (per type),
    // e.g., _int_01, _float_01, _string_01, _time_01, _langString_01, _blob_01
    '_int_01',
    '_float_01',
    '_string_01',
    '_time_01',
    '_langString_01',
    '_blob_01'
  ])],

  // Locking
  ['_lock', new Set<string>([
    '_type',
    '_locked',
    '_user_id',
    '_man_id',
    '_man_nr',
    '_man_type'
  ])],

  // Message conversion (raw -> engineering); data-type dependent detail attributes
  ['_msg_conv', new Set<string>([
    '_type',
    '_num_conv',
    '_list_conv',
    // For point-curve conversion etc., additional attributes like
    // _linint_num, _linint_x, _linint_y, ... exist (data-type dependent).
  ])],

  // The value-bearing configs (_original, _online, _offline) share the same attributes
  ['_original', new Set<string>([
    '_active',
    '_value',
    '_stime',
    '_status',
    '_text',
    '_user',
    '_manager',
    // Status helpers:
    '_userbits',
    '_userword1',
    '_userword2',
    // Individual user bits (1..8) are also available: _userbit1 .. _userbit8
    '_userbit1','_userbit2','_userbit3','_userbit4','_userbit5','_userbit6','_userbit7','_userbit8'
  ])],
  ['_online', new Set<string>([
    '_active',
    '_value',
    '_stime',
    '_status',
    '_text',
    '_user',
    '_manager',
    // Online-specific helpers (subset shown):
    '_alert_range',
    '_aut_default',
    '_aut_inv',
    '_bad',
    '_comp_corr'
  ])],
  ['_offline', new Set<string>([
    '_active',
    '_value',
    '_stime',
    '_status',
    '_text',
    '_user',
    '_manager'
  ])],

  // WinCC OA value range
  ['_pv_range', new Set<string>([
    '_type',
    // General
    '_ignor_inv',
    '_neg',
    // Min/Max range
    '_min',
    '_max',
    '_incl_min',
    '_incl_max',
    // Set (discrete) values
    '_set',
    // Matching
    '_match'
  ])],

  // Smoothing (driver-side)
  ['_smooth', new Set<string>([
    '_type',
    // Example attributes for derivative-based smoothing
    '_deriv_limit',
    '_deriv_time',
    '_deriv_tol1',
    '_deriv_tol2'
    // Other smoothing types have their own attributes (see docs).
  ])],

  // First archived times (per config)
  ['_start', new Set<string>([
    '_original',
    '_online',
    '_offline'
  ])],

  // User value range (per authorization level; detail index = level)
  ['_u_range', new Set<string>([
    '_type',
    '_list_auth',
    // MinMax
    '_min',
    '_max',
    '_incl_min',
    '_incl_max',
    // Set (discrete) values
    '_set',
    // Matching
    '_match',
    // Negation
    '_neg'
  ])]
]);

export default dpConfigAttributes;
