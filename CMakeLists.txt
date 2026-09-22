cmake_minimum_required(VERSION 3.20)

project(link2_dwell_demo LANGUAGES CXX)

if(NOT WIN32)
    message(FATAL_ERROR "This demo uses the Windows build of the Insta360 Link SDK.")
endif()

if(NOT CMAKE_SIZEOF_VOID_P EQUAL 8)
    message(FATAL_ERROR "Configure an x64 build. The demo intentionally uses the SDK x64 binaries.")
endif()

set(LINK_SDK_ARCHIVE
    "${CMAKE_CURRENT_LIST_DIR}/../../SDK/Link SDK/Link SDK/UVCCamera_win.zip"
    CACHE FILEPATH
    "Path to UVCCamera_win.zip")

if(NOT EXISTS "${LINK_SDK_ARCHIVE}")
    message(FATAL_ERROR "Link SDK archive not found: ${LINK_SDK_ARCHIVE}")
endif()

# Keep the vendor package out of the source tree. CMake extracts the exact SDK
# archive supplied with this project into the build directory.
set(LINK_SDK_EXTRACT_DIR "${CMAKE_BINARY_DIR}/link_sdk")
set(LINK_SDK_HEADER "${LINK_SDK_EXTRACT_DIR}/x64/include/uvc_camera.h")

if(NOT EXISTS "${LINK_SDK_HEADER}")
    file(MAKE_DIRECTORY "${LINK_SDK_EXTRACT_DIR}")
    file(ARCHIVE_EXTRACT
        INPUT "${LINK_SDK_ARCHIVE}"
        DESTINATION "${LINK_SDK_EXTRACT_DIR}")
endif()

set(LINK_SDK_INCLUDE_DIR "${LINK_SDK_EXTRACT_DIR}/x64/include")
set(LINK_SDK_IMPORT_LIB "${LINK_SDK_EXTRACT_DIR}/x64/lib/UVCCamera.lib")
set(LINK_SDK_DLL "${LINK_SDK_EXTRACT_DIR}/x64/bin/UVCCamera.dll")

foreach(required_file
        "${LINK_SDK_HEADER}"
        "${LINK_SDK_IMPORT_LIB}"
        "${LINK_SDK_DLL}")
    if(NOT EXISTS "${required_file}")
        message(FATAL_ERROR "Required Link SDK file not found after extraction: ${required_file}")
    endif()
endforeach()

add_library(Insta360UVCCamera SHARED IMPORTED GLOBAL)
set_target_properties(Insta360UVCCamera PROPERTIES
    IMPORTED_IMPLIB "${LINK_SDK_IMPORT_LIB}"
    IMPORTED_LOCATION "${LINK_SDK_DLL}")

add_executable(link2_dwell_demo
    main.cc
    debug_ui.cc
    video_stream_capture.cc)
target_compile_features(link2_dwell_demo PRIVATE cxx_std_11)
target_compile_definitions(link2_dwell_demo PRIVATE WIN32 NOMINMAX)
target_include_directories(link2_dwell_demo PRIVATE "${LINK_SDK_INCLUDE_DIR}")
target_link_libraries(link2_dwell_demo PRIVATE
    Insta360UVCCamera
    comctl32
    gdi32
    ole32
    strmiids
    user32)

if(MSVC)
    target_compile_options(link2_dwell_demo PRIVATE /W4 /utf-8)
endif()

add_custom_command(TARGET link2_dwell_demo POST_BUILD
    COMMAND "${CMAKE_COMMAND}" -E copy_if_different
            "${LINK_SDK_DLL}"
            "$<TARGET_FILE_DIR:link2_dwell_demo>/UVCCamera.dll"
    VERBATIM)
